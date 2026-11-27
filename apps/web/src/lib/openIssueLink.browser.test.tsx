import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import {
  EnvironmentId,
  SourceControlProviderKind,
  ThreadId,
  type ScopedThreadRef,
} from "@s1tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";
import { useProjects, useServerConfigs } from "../state/entities";
import { useOpenIssueLink } from "./openIssueLink";

const LOCAL = EnvironmentId.make("local");
const REMOTE = EnvironmentId.make("remote");
const localThread = scopeThreadRef(LOCAL, ThreadId.make("local-thread"));
const shownThread = scopeThreadRef(LOCAL, ThreadId.make("shown-thread"));
const ISSUE_URL = "https://github.com/acme/api/issues/7";

vi.mock("../state/entities", { spy: true });
vi.mock("../components/chat/openThreadDetails", () => ({
  openInShownThread: async (_router: unknown, open: (threadRef: ScopedThreadRef) => void) =>
    open(shownThread),
}));

const githubProject = (id: string, environmentId: EnvironmentId, repository: string) => ({
  id,
  environmentId,
  title: id,
  workspaceRoot: `/${id}`,
  repositoryIdentity: {
    canonicalKey: `github.com/${repository}`,
    locator: { source: "git-remote", remoteName: "origin", remoteUrl: "" },
    provider: SourceControlProviderKind.make("github"),
    displayName: repository,
  },
});

function setup(): Disposable {
  useRightPanelStore.setState({ byThreadKey: {}, userActionRevisionByThreadKey: {} });
  vi.mocked(useProjects).mockReturnValue([
    githubProject("web", LOCAL, "acme/web"),
    githubProject("api", REMOTE, "acme/api"),
  ] as never);
  const issues = { environment: { capabilities: { issues: true } } };
  vi.mocked(useServerConfigs).mockReturnValue(
    new Map([
      [LOCAL, issues],
      [REMOTE, issues],
    ]) as never,
  );
  return {
    [Symbol.dispose]: () => {
      vi.mocked(useProjects).mockReset();
      vi.mocked(useServerConfigs).mockReset();
    },
  };
}

function IssueLink(props: { threadRef?: ScopedThreadRef; environmentId: EnvironmentId }) {
  const openIssueLink = useOpenIssueLink(props.threadRef);
  return (
    <button type="button" onClick={(event) => openIssueLink(event, ISSUE_URL, props.environmentId)}>
      issue
    </button>
  );
}

const surfaces = (threadRef: ScopedThreadRef) =>
  selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef).surfaces;

it("opens a link in a remote issue against the remote environment, beside the local thread", async () => {
  using _setup = setup();
  await using _screen = await render(<IssueLink threadRef={localThread} environmentId={REMOTE} />);
  await page.getByRole("button", { name: "issue" }).click();
  expect(surfaces(localThread)).toEqual([
    expect.objectContaining({ kind: "issue", environmentId: REMOTE, projectId: "api", key: "7" }),
  ]);
});

it("opens a link outside any thread, such as in a workflow's pull request, beside the shown thread", async () => {
  using _setup = setup();
  await using _screen = await render(<IssueLink environmentId={REMOTE} />);
  await page.getByRole("button", { name: "issue" }).click();
  await expect
    .poll(() => surfaces(shownThread))
    .toEqual([
      expect.objectContaining({ kind: "issue", environmentId: REMOTE, projectId: "api", key: "7" }),
    ]);
});
