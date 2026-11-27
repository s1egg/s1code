import { describe, expect, it } from "vite-plus/test";

import { countFileChangeLines } from "./fileChangeLineCounts.ts";

describe("countFileChangeLines", () => {
  it("does not count a terminal newline as a line", () => {
    expect(countFileChangeLines({ newStr: "one\ntwo\n" })).toEqual({ additions: 2, deletions: 0 });
    expect(countFileChangeLines({ oldStr: "", newStr: "" })).toEqual({
      additions: 0,
      deletions: 0,
    });
  });

  it("sees the unchanged middle between changed first and last lines", () => {
    expect(countFileChangeLines({ oldStr: "a\nb\nc\n", newStr: "A\nb\nC\n" })).toEqual({
      additions: 2,
      deletions: 2,
    });
    expect(
      countFileChangeLines({ oldStr: "a\nold one\nold two\nz", newStr: "a\nnew one\nz" }),
    ).toEqual({ additions: 1, deletions: 2 });
  });

  it("counts hunk lines that look like file headers", () => {
    const diff = [
      "--- a/loop.c",
      "+++ b/loop.c",
      "@@ -1,3 +1,3 @@",
      " while (i) {",
      "---i;",
      "+++i;",
      " }",
    ].join("\n");
    expect(countFileChangeLines({ diffStr: diff })).toEqual({ additions: 1, deletions: 1 });
  });

  it("counts several hunks and files, and hunks without ranges", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,2 +1,3 @@",
      " keep",
      "-old",
      "+new",
      "+more",
      "@@ -10 +11 @@",
      "-x",
      "+y",
      "\\ No newline at end of file",
      "diff --git a/b.ts b/b.ts",
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@",
      "-gone",
      " kept",
    ].join("\n");
    expect(countFileChangeLines({ diffStr: diff })).toEqual({ additions: 3, deletions: 3 });
    expect(countFileChangeLines({ diffStr: "String to replace not found" })).toBeNull();
    expect(countFileChangeLines({})).toBeNull();
  });
});

describe("countFileChangeLines on large files", () => {
  const numbered = (count: number, prefix = "line") =>
    Array.from({ length: count }, (_, index) => `${prefix} ${index}`);

  // regression: past the exact diff's cap, a two-line edit persisted as a whole-file rewrite
  it("counts a small edit to a large file exactly", () => {
    const before = numbered(2_001);
    const after = [...before];
    after[0] = "changed first";
    after[2_000] = "changed last";
    expect(countFileChangeLines({ oldStr: before.join("\n"), newStr: after.join("\n") })).toEqual({
      additions: 2,
      deletions: 2,
    });
  });

  it("says nothing rather than guess when the edit is too large to diff quickly", () => {
    const counts = countFileChangeLines({
      oldStr: numbered(2_000, "old").join("\n"),
      newStr: numbered(2_000, "new").join("\n"),
    });
    expect(counts).toBeNull();
  });

  it("still counts a large new file by its lines", () => {
    expect(countFileChangeLines({ newStr: numbered(50_000).join("\n") })).toEqual({
      additions: 50_000,
      deletions: 0,
    });
  });
});

describe("countFileChangeLines budget", () => {
  // regression: one long matching run could pass the budget before it was checked
  it("stops inside a long matching run between changed ends", () => {
    const middle = Array.from({ length: 2_100_000 }, () => "same");
    expect(
      countFileChangeLines({
        oldStr: ["a", ...middle, "b"].join("\n"),
        newStr: ["c", ...middle, "d"].join("\n"),
      }),
    ).toBeNull();
  });
});
