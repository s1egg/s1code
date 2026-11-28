import { scopedThreadKey, scopeThreadRef } from "@s1tools/client-runtime/environment";
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@s1tools/contracts";
import { StrictMode, useEffect } from "react";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";
import { useRightPanelStore } from "../rightPanelStore";
import { KeptThreadTerminals, TerminalPaneSlot } from "./PersistentThreadTerminals";

const views = vi.hoisted(() => ({ mounts: [] as string[], unmounts: [] as string[] }));

vi.mock("./ThreadTerminalDrawer", () => ({
  default: (props: { threadId: string; visible: boolean }) => {
    useEffect(() => {
      views.mounts.push(props.threadId);
      return () => {
        views.unmounts.push(props.threadId);
      };
    }, [props.threadId]);
    return <div data-terminal-view={props.threadId} data-visible={String(props.visible)} />;
  },
}));
vi.mock("../state/entities", () => ({
  useQuietThreadShell: (ref: ScopedThreadRef) => ({
    environmentId: ref.environmentId,
    projectId: "project-1",
    worktreePath: null,
  }),
  useProject: () => ({ workspaceRoot: "/repo" }),
}));
vi.mock("../state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("../state/terminalSessions", () => ({ useTerminalDrawerSessions: () => null }));
vi.mock("./terminal/useThreadTerminalActions", () => ({ useThreadTerminalActions: () => ({}) }));
vi.mock("../composerDraftStore", () => ({ useComposerDraftStore: () => null }));

const environmentId = EnvironmentId.make("environment-a");
const refA = scopeThreadRef(environmentId, ThreadId.make("thread-a"));
const refB = scopeThreadRef(environmentId, ThreadId.make("thread-b"));

// Under StrictMode, as in dev, effects run, clean up and run again on mount.
function Harness(props: { readonly threadRef: ScopedThreadRef; readonly pane: boolean }) {
  return (
    <StrictMode>
      <KeptThreadTerminals
        activeThreadKey={scopedThreadKey(props.threadRef)}
        active={{ launchContext: null, keybindings: [], onAddTerminalContext: () => {} }}
      />
      {props.pane ? (
        <div data-slot-for={props.threadRef.threadId}>
          <TerminalPaneSlot threadRef={props.threadRef} />
        </div>
      ) : null}
    </StrictMode>
  );
}

it("keeps a thread's terminal views mounted while another thread shows, and puts them back", async () => {
  useRightPanelStore.setState({ byThreadKey: {} });
  useRightPanelStore.getState().open(refA, "terminal");
  views.mounts.length = 0;
  views.unmounts.length = 0;
  await using screen = await render(<Harness threadRef={refA} pane />);
  const view = () => document.querySelector<HTMLElement>('[data-terminal-view="thread-a"]');
  await vi.waitFor(() => expect(view()?.dataset.visible).toBe("true"));
  const mounted = view();
  expect(mounted?.closest('[data-slot-for="thread-a"]')).not.toBeNull();
  const effects = [views.mounts.length, views.unmounts.length];

  await screen.rerender(<Harness threadRef={refB} pane={false} />);
  await vi.waitFor(() => expect(view()?.dataset.visible).toBe("false"));
  expect(view()?.closest('[data-slot-for="thread-a"]')).toBeNull();

  await screen.rerender(<Harness threadRef={refA} pane />);
  await vi.waitFor(() => expect(view()?.dataset.visible).toBe("true"));
  expect(view()).toBe(mounted);
  expect(view()?.closest('[data-slot-for="thread-a"]')).not.toBeNull();
  expect(mounted?.isConnected).toBe(true);
  expect([views.mounts.length, views.unmounts.length]).toEqual(effects);

  // Hiding the terminal pane lets its views go, as the old drawer did.
  useRightPanelStore.getState().hidePane(refA, "terminal");
  await screen.rerender(<Harness threadRef={refA} pane={false} />);
  await vi.waitFor(() => expect(view()).toBeNull());
  expect(views.unmounts.length).toBe(effects[1]! + 1);
});
