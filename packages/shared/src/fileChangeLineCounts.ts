export interface FileChangeLineCounts {
  readonly additions: number;
  readonly deletions: number;
}

// Myers' diff costs about (lines × edits); past these budgets the counts are left unknown rather
// than guessed, which keeps ingest and a first render to a few milliseconds.
const MAX_EDITS = 1_000;
const MAX_DIFF_STEPS = 2_000_000;
const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

function lines(text: string): ReadonlyArray<string> {
  if (text === "") return [];
  const split = text.split("\n");
  // A terminal newline ends the last line rather than starting another.
  return text.endsWith("\n") ? split.slice(0, -1) : split;
}

interface UnifiedDiffWalk {
  readonly sawHunk: boolean;
  readonly additions: number;
  readonly deletions: number;
  /** The `---`/`+++` header pairs outside hunks, in order. */
  readonly files: ReadonlyArray<{ readonly oldPath: string; readonly newPath: string }>;
}

// "a/src/x.ts\t2024-01-01 …" -> "src/x.ts"; /dev/null stays as it is.
function headerPath(header: string): string {
  const path = header.slice(4).split("\t", 1)[0]!.trim();
  return path === "/dev/null" ? path : path.replace(/^[ab]\//, "");
}

/** Reads a unified diff by hunk state, so lines inside a hunk never pass for headers. */
function walkUnifiedDiff(diff: string): UnifiedDiffWalk {
  let additions = 0;
  let deletions = 0;
  let sawHunk = false;
  const files: Array<{ oldPath: string; newPath: string }> = [];
  // Lines left in the current hunk by its ranges; a hunk without ranges runs to the next header.
  let oldLeft = 0;
  let newLeft = 0;
  let openEnded = false;
  const all = diff.split("\n");
  for (let index = 0; index < all.length; index += 1) {
    const line = all[index]!;
    const inHunk = openEnded || oldLeft > 0 || newLeft > 0;
    const fileHeader =
      line.startsWith("diff ") ||
      (line.startsWith("--- ") && all[index + 1]?.startsWith("+++ ") === true);
    if (inHunk && !line.startsWith("@@") && !(openEnded && fileHeader)) {
      if (line.startsWith("+")) {
        additions += 1;
        newLeft -= 1;
        continue;
      }
      if (line.startsWith("-")) {
        deletions += 1;
        oldLeft -= 1;
        continue;
      }
      if (line.startsWith(" ") || line === "") {
        oldLeft -= 1;
        newLeft -= 1;
        continue;
      }
      if (line.startsWith("\\")) continue;
    }
    openEnded = false;
    oldLeft = 0;
    newLeft = 0;
    if (line.startsWith("--- ") && all[index + 1]?.startsWith("+++ ")) {
      files.push({ oldPath: headerPath(line), newPath: headerPath(all[index + 1]!) });
      index += 1;
      continue;
    }
    if (!line.startsWith("@@")) continue;
    sawHunk = true;
    const ranges = HUNK_HEADER.exec(line);
    if (ranges) {
      oldLeft = ranges[1] === undefined ? 1 : Number(ranges[1]);
      newLeft = ranges[2] === undefined ? 1 : Number(ranges[2]);
    } else {
      openEnded = true;
    }
  }
  return { sawHunk, additions, deletions, files };
}

export interface FileChangeOperation {
  readonly operation: "add" | "delete" | "update";
  readonly path: string;
}

/**
 * The files a unified diff creates, deletes, or updates, from its own file headers. Null unless it
 * creates or deletes one, so a plain edit records no operation.
 */
export function unifiedDiffFileOperations(diff: string): ReadonlyArray<FileChangeOperation> | null {
  const operations = walkUnifiedDiff(diff).files.map(({ oldPath, newPath }): FileChangeOperation =>
    oldPath === "/dev/null"
      ? { operation: "add", path: newPath }
      : newPath === "/dev/null"
        ? { operation: "delete", path: oldPath }
        : { operation: "update", path: newPath },
  );
  return operations.some((change) => change.operation !== "update") ? operations : null;
}

/** Myers' shortest edit script length (insertions + deletions), or null past the budget. */
function editDistance(before: ReadonlyArray<string>, after: ReadonlyArray<string>): number | null {
  const n = before.length;
  const m = after.length;
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const furthest = new Int32Array(2 * max + 3);
  let steps = 0;
  for (let edits = 0; edits <= max; edits += 1) {
    for (let diagonal = -edits; diagonal <= edits; diagonal += 2) {
      let x =
        diagonal === -edits ||
        (diagonal !== edits && furthest[offset + diagonal - 1]! < furthest[offset + diagonal + 1]!)
          ? furthest[offset + diagonal + 1]!
          : furthest[offset + diagonal - 1]! + 1;
      let y = x - diagonal;
      steps += 1;
      while (x < n && y < m && before[x] === after[y]) {
        x += 1;
        y += 1;
        steps += 1;
        if (steps > MAX_DIFF_STEPS) return null;
      }
      furthest[offset + diagonal] = x;
      if (x >= n && y >= m) return edits;
    }
    if (steps > MAX_DIFF_STEPS) return null;
  }
  return null;
}

function countTextChange(oldText: string, newText: string): FileChangeLineCounts | null {
  const before = lines(oldText);
  const after = lines(newText);
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }
  const changedBefore = before.slice(head, before.length - tail);
  const changedAfter = after.slice(head, after.length - tail);
  if (changedBefore.length === 0 || changedAfter.length === 0) {
    return { additions: changedAfter.length, deletions: changedBefore.length };
  }
  const edits = editDistance(changedBefore, changedAfter);
  if (edits === null) return null;
  const common = (changedBefore.length + changedAfter.length - edits) / 2;
  return {
    additions: changedAfter.length - common,
    deletions: changedBefore.length - common,
  };
}

/**
 * Added and removed lines of a file change: from a unified diff's hunks when there is one, else
 * from its old and new text. Null when neither says, or when the text diff is too large to count
 * exactly.
 */
export function countFileChangeLines(change: {
  readonly diffStr?: string | undefined;
  readonly oldStr?: string | undefined;
  readonly newStr?: string | undefined;
}): FileChangeLineCounts | null {
  if (change.diffStr !== undefined) {
    const { sawHunk, additions, deletions } = walkUnifiedDiff(change.diffStr);
    return sawHunk ? { additions, deletions } : null;
  }
  if (change.newStr === undefined) return null;
  return countTextChange(change.oldStr ?? "", change.newStr);
}
