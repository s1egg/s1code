import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type ScopedThreadRef,
  type ThreadPullRequestLink,
} from "@s1tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

const SCRATCH_ROOT = "/home/user/.s1/scratch";

const state = vi.hoisted(() => ({
  workspaceRoot: "",
  folder: "",
  pullRequests: [] as unknown[],
  configLoaded: true,
}));

// The read of s1.json is a cache: a re-read is the only way to see what is on disk now.
const t3File = vi.hoisted(() => ({
  disk: "",
  cached: "",
  listeners: new Set<() => void>(),
}));

vi.mock(import("~/components/files/projectFilesQueryState"), async (importOriginal) => {
  const actual = await importOriginal();
  const { useSyncExternalStore } = await import("react");
  return {
    ...actual,
    useProjectFileQuery: ((_environmentId: unknown, _cwd: string, relativePath: string | null) => {
      const contents = useSyncExternalStore(
        (listener) => {
          t3File.listeners.add(listener);
          return () => t3File.listeners.delete(listener);
        },
        () => t3File.cached,
      );
      const refresh = () => {
        t3File.cached = t3File.disk;
        for (const listener of t3File.listeners) listener();
      };
      const data =
        relativePath === "s1.json" && contents !== ""
          ? { relativePath, contents, byteLength: contents.length, truncated: false }
          : null;
      return {
        data,
        error: null,
        isPending: false,
        readError: null,
        isNotFile: false,
        isFile: data !== null,
        refresh,
      };
    }) as never,
  };
});

vi.mock(import("~/state/entities"), async (importOriginal) => ({
  ...(await importOriginal()),
  useProject: ((ref: unknown) =>
    ref === null
      ? null
      : {
          id: "project",
          environmentId: "environment",
          title: state.workspaceRoot === SCRATCH_ROOT ? "No project" : "plain",
          workspaceRoot: state.workspaceRoot,
          scripts: [],
        }) as never,
  useProjects: (() => []) as never,
  useQuietThreadShell: ((ref: unknown) =>
    ref === null
      ? null
      : {
          id: "thread",
          environmentId: "environment",
          projectId: "project",
          worktreePath: state.folder,
          branch: null,
          pullRequests: state.pullRequests,
        }) as never,
  useServerConfigs: (() =>
    new Map(
      state.configLoaded
        ? [
            [
              EnvironmentId.make("environment"),
              {
                scratchWorkspaceRoot: SCRATCH_ROOT,
                environment: { capabilities: { pullRequests: true } },
              },
            ],
          ]
        : [],
    )) as never,
}));
// Neither folder is a repository, which is what the server reports for both.
vi.mock(import("~/state/vcs"), async (importOriginal) => {
  const actual = await importOriginal();
  const notARepo = Atom.make(
    AsyncResult.success({
      isRepo: false,
      hasPrimaryRemote: false,
      isDefaultRef: false,
      refName: null,
      hasWorkingTreeChanges: false,
      workingTree: { files: [], insertions: 0, deletions: 0 },
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      aheadOfDefaultCount: 0,
      pr: null,
    }),
  );
  return {
    ...actual,
    vcsEnvironment: { ...actual.vcsEnvironment, status: (() => notARepo) as never },
  };
});

import { DEFAULT_CLIENT_SETTINGS } from "@s1tools/contracts/settings";
import type { ContextWindowSnapshot } from "@s1tools/client-runtime/state/context-window";
import { act, render } from "../../../test/render";
import { __setClientSettingsForTests } from "../../hooks/useSettings";
import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { PopoverCreateHandle } from "../ui/popover";
import { ThreadDetailsSidebar } from "./ThreadDetailsSidebar";
import { useThreadDetailsStore } from "./threadDetailsStore";

const threadRef: ScopedThreadRef = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("thread"),
};
const linkedPullRequest: ThreadPullRequestLink = {
  host: "github.com",
  repository: "s1egg/s1code",
  number: 27513,
  url: "https://github.com/s1egg/s1code/pull/27513",
  source: "manual",
  linkedAt: "2026-10-30T00:00:00.000Z",
  snapshot: null,
  stack: null,
};
const contextWindow = {
  usedTokens: 24_000,
  maxTokens: 200_000,
  usedPercentage: 12,
  inputTokens: 20_000,
  outputTokens: 4_000,
} as ContextWindowSnapshot;

function setup(input: {
  workspaceRoot: string;
  folder: string;
  pullRequests?: ThreadPullRequestLink[];
  configLoaded?: boolean;
  dockedOpen?: boolean;
}) {
  state.configLoaded = input.configLoaded ?? true;
  state.workspaceRoot = input.workspaceRoot;
  state.folder = input.folder;
  state.pullRequests = input.pullRequests ?? [];
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    threadDetailsOpen: input.dockedOpen ?? true,
  });
  useThreadDetailsStore.setState({ popoverOpen: false, drillIn: null });
  const anchor = document.createElement("div");
  document.body.append(anchor);
  return {
    anchor: { current: anchor },
    handle: PopoverCreateHandle(),
    [Symbol.dispose]: () => anchor.remove(),
  };
}

const machines = (["This Mac", "Server"] as const).map((label, index) => ({
  environmentId: EnvironmentId.make(index === 0 ? "environment" : "other"),
  projectId: ProjectId.make("project"),
  label,
  isPrimary: index === 0,
  machine: "server" as const,
}));

function Panel({
  fixture,
  presentation = "docked",
  draftEnvMode,
  onMachines = false,
  withScripts = false,
  withContext = false,
}: {
  fixture: ReturnType<typeof setup>;
  presentation?: ThreadPanelPresentation;
  /** Renders an unsent draft in this mode instead of a started thread. */
  draftEnvMode?: "local" | "worktree";
  onMachines?: boolean;
  withScripts?: boolean;
  withContext?: boolean;
}) {
  const noop = () => {};
  const scriptResult = async () => ({ ok: true }) as never;
  return (
    <ThreadDetailsSidebar
      presentation={presentation}
      anchor={fixture.anchor}
      handle={fixture.handle}
      environmentId={threadRef.environmentId}
      threadId={threadRef.threadId}
      projectId={ProjectId.make("project")}
      composerDraftTarget={threadRef}
      worktreePath={draftEnvMode === undefined ? state.folder : null}
      isServerThread={draftEnvMode === undefined}
      activeProjectName={state.workspaceRoot === SCRATCH_ROOT ? "No project" : "plain"}
      activeProjectScripts={withScripts ? [] : undefined}
      preferredScriptId={null}
      keybindings={[]}
      availableEditors={[]}
      showOpenInPicker={false}
      openInShortcutEnabled={false}
      gitCwd={state.folder}
      workspaceMutationId={null}
      isGitRepo={false}
      offersWorkspaceModes={false}
      envLocked={draftEnvMode === undefined}
      availableEnvironments={onMachines ? machines : []}
      {...(onMachines ? { onEnvironmentChange: noop } : {})}
      onEnvModeChange={noop}
      envMode={draftEnvMode ?? "local"}
      startFromOrigin={false}
      onStartFromOriginChange={noop}
      onComposerFocusRequest={noop}
      onRunProjectScript={noop}
      onAddProjectScript={scriptResult}
      onUpdateProjectScript={scriptResult}
      onDeleteProjectScript={scriptResult}
      usage={{
        providerInstanceId: null,
        model: null,
        providers: [],
        sources: {} as never,
        contextWindow: withContext ? contextWindow : null,
      }}
    />
  );
}

const docked = () => document.querySelector('[data-thread-details-panel="docked"]');

it("docks beside the chat while open", async () => {
  using fixture = setup({ workspaceRoot: "/work/plain", folder: "/work/plain" });
  await using _screen = await render(<Panel fixture={fixture} />);
  await expect.element(page.getByRole("region", { name: "Thread details" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Environment" })).toBeVisible();
});

it("renders nothing docked once closed", async () => {
  using fixture = setup({ workspaceRoot: "/work/plain", folder: "/work/plain", dockedOpen: false });
  await using _screen = await render(<Panel fixture={fixture} />);
  expect(docked()).toBeNull();
});

it("opens as a popover while the right panel is open, and closes it when it docks again", async () => {
  using fixture = setup({ workspaceRoot: "/work/plain", folder: "/work/plain" });
  await using screen = await render(<Panel fixture={fixture} presentation="popover" />);
  expect(docked()).toBeNull();
  expect(document.querySelector('[data-thread-details-panel="popover"]')).toBeNull();

  await act(() => useThreadDetailsStore.getState().setPopoverOpen(true));
  await expect.element(page.getByRole("dialog", { name: "Thread details" })).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Environment" })).toBeVisible();

  await screen.rerender(<Panel fixture={fixture} />);
  await expect.element(page.getByRole("region", { name: "Thread details" })).toBeVisible();
  expect(useThreadDetailsStore.getState().popoverOpen).toBe(false);
  await screen.rerender(<Panel fixture={fixture} presentation="popover" />);
  expect(document.querySelector('[data-thread-details-panel="popover"]')).toBeNull();
});

it("drills into the context window and returns to the sections with back or Escape", async () => {
  using fixture = setup({ workspaceRoot: "/work/plain", folder: "/work/plain" });
  await using _screen = await render(<Panel fixture={fixture} withContext />);
  const contextRow = page.getByRole("button", { name: /^Context\s?12%$/ });
  await contextRow.click();
  const back = page.getByRole("button", { name: "Back" });
  await expect.element(back).toHaveFocus();
  await expect.element(page.getByRole("heading", { name: "Context window" })).toBeVisible();
  await expect.element(page.getByText("Output tokens")).toBeVisible();
  await expect.element(page.getByRole("heading", { name: "Environment" })).not.toBeInTheDocument();

  await back.click();
  await expect.element(page.getByRole("heading", { name: "Environment" })).toBeVisible();
  await expect.element(contextRow).toHaveFocus();

  await contextRow.click();
  await expect.element(back).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("heading", { name: "Environment" })).toBeVisible();
  await expect.element(contextRow).toHaveFocus();
});

it("offers no git controls in a No project thread, but shows its linked pull request", async () => {
  using fixture = setup({
    workspaceRoot: SCRATCH_ROOT,
    folder: `${SCRATCH_ROOT}/thread`,
    pullRequests: [linkedPullRequest],
  });
  await using _screen = await render(<Panel fixture={fixture} />);
  await expect.element(page.getByText("#27513")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Initialize Git" }))
    .not.toBeInTheDocument();
});

it("shows Current checkout where no worktree can come from, even when New worktree is the default", async () => {
  using fixture = setup({ workspaceRoot: SCRATCH_ROOT, folder: SCRATCH_ROOT });
  await using _screen = await render(<Panel fixture={fixture} draftEnvMode="worktree" />);
  await expect.element(page.getByLabelText("Run context: Current checkout")).toBeVisible();
  await expect.element(page.getByRole("button", { name: /Run context/ })).not.toBeInTheDocument();
});

it("offers only machines where no worktree can come from and several machines exist", async () => {
  using fixture = setup({ workspaceRoot: SCRATCH_ROOT, folder: SCRATCH_ROOT });
  await using _screen = await render(
    <Panel fixture={fixture} draftEnvMode="worktree" onMachines />,
  );
  await page.getByRole("button", { name: "Run context: This Mac, Current checkout" }).click();
  await expect.element(page.getByText("Run on")).toBeVisible();
  await expect.element(page.getByText("New worktree")).not.toBeInTheDocument();
});

it("shows a linked pull request in a folder that is not a git repository", async () => {
  using fixture = setup({
    workspaceRoot: "/work/plain",
    folder: "/work/plain",
    pullRequests: [linkedPullRequest],
  });
  await using _screen = await render(<Panel fixture={fixture} />);
  await expect.element(page.getByRole("region", { name: "Environment" })).toBeVisible();
  await expect.element(page.getByText("#27513")).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Initialize Git" })).toBeVisible();
});

it("offers no Initialize Git before the server config says where No project lives", async () => {
  using fixture = setup({
    workspaceRoot: SCRATCH_ROOT,
    folder: `${SCRATCH_ROOT}/thread`,
    configLoaded: false,
  });
  await using _screen = await render(<Panel fixture={fixture} />);
  await expect.element(page.getByRole("region", { name: "Environment" })).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Initialize Git" }))
    .not.toBeInTheDocument();
});

it("lists the s1.json actions on disk when the actions menu opens again after the file changed", async () => {
  using fixture = setup({ workspaceRoot: "/work/plain", folder: "/work/plain" });
  const t3Json = (name: string) =>
    JSON.stringify({ scripts: [{ name, command: `npm run dev -- --port ${name.slice(-4)}` }] });
  t3File.disk = t3Json("Dev 4100");
  t3File.cached = t3File.disk;
  await using _screen = await render(<Panel fixture={fixture} withScripts />);

  const chooser = page.getByRole("button", { name: "Choose project action" });
  await chooser.click();
  await expect.element(page.getByRole("menuitem", { name: /Dev 4100/ })).toBeVisible();
  await chooser.click();
  await expect.element(page.getByRole("menu")).not.toBeInTheDocument();

  // A setup hook rewrites this checkout's s1.json outside S1 Code.
  t3File.disk = t3Json("Dev 4200");

  await chooser.click();
  await expect.element(page.getByRole("menuitem", { name: /Dev 4200/ })).toBeVisible();
});
