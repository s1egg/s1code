import type { ScopedThreadRef } from "@s1tools/contracts";
import { scopedThreadKey } from "@s1tools/client-runtime/environment";
import { create } from "zustand";

import {
  getClientSettings,
  updateClientSettings,
  useClientSettings,
} from "../../hooks/useSettings";
import { requestWorkspaceFocus } from "../../lib/workspaceFocus";
import type { ThreadPanelPresentation } from "../../rightPanelLayout";

/** Views that open inside the thread details sidebar in place of its sections. */
export type ThreadDetailsDrillInId =
  | "context"
  | "usage"
  | "usage-prices"
  | "pull-requests"
  | "issues";

/** The thread details sidebar on screen: the thread it belongs to and where it shows. */
export interface AttachedThreadDetails {
  readonly threadRef: ScopedThreadRef;
  readonly presentation: ThreadPanelPresentation;
}

interface ThreadDetailsStoreState {
  /** The thread the popover and drill-in state belong to; another thread's sidebar starts fresh. */
  readonly scope: string | null;
  /** The popover form, shown while the right panel is open or the window is narrow. */
  readonly popoverOpen: boolean;
  readonly drillIn: ThreadDetailsDrillInId | null;
  readonly attached: AttachedThreadDetails | null;
  /** Asked for before any sidebar mounted, such as right after navigating to a thread. */
  readonly pending: ReadonlyArray<(attached: AttachedThreadDetails) => void>;
  /** The docked sidebar was closed until a drill-in opened it, so toggling it off closes it again. */
  readonly openedForDrillIn: boolean;
  /**
   * The list whose saved project filters an old page address set, so it opens with them instead
   * of the thread's own project. Cleared when the drill-in changes.
   */
  readonly explicitListScope: "pull-requests" | "issues" | null;
  /** The last list length each drill-in showed for a project, keyed by threadDetailsListCountKey. */
  readonly listCounts: Readonly<Record<string, number>>;
  readonly setPopoverOpen: (open: boolean) => void;
  readonly setDrillIn: (drillIn: ThreadDetailsDrillInId | null) => void;
  readonly attach: (attached: AttachedThreadDetails) => void;
  readonly detach: (attached: AttachedThreadDetails) => void;
  readonly setListCount: (key: string, count: number) => void;
}

// Not persisted: the docked open state is the threadDetailsOpen client setting, and a popover or
// drill-in left open should not reappear unasked after a reload.
export const useThreadDetailsStore = create<ThreadDetailsStoreState>()((set, get) => ({
  scope: null,
  popoverOpen: false,
  drillIn: null,
  attached: null,
  pending: [],
  openedForDrillIn: false,
  explicitListScope: null,
  listCounts: {},
  setPopoverOpen: (popoverOpen) => set({ popoverOpen }),
  setDrillIn: (drillIn) => set({ drillIn, openedForDrillIn: false, explicitListScope: null }),
  attach: (attached) => {
    const { pending, scope } = get();
    const key = scopedThreadKey(attached.threadRef);
    set({
      attached,
      pending: [],
      ...(key === scope
        ? {}
        : {
            scope: key,
            drillIn: null,
            popoverOpen: false,
            openedForDrillIn: false,
            explicitListScope: null,
          }),
    });
    for (const action of pending) action(attached);
  },
  // Another thread's sidebar can mount before this one's cleanup runs.
  detach: (attached) => {
    if (get().attached === attached) set({ attached: null });
  },
  setListCount: (key, count) => {
    if (get().listCounts[key] !== count) set({ listCounts: { ...get().listCounts, [key]: count } });
  },
}));

/** Where a list drill-in files how many rows it last showed for a project. */
export function threadDetailsListCountKey(
  drillIn: "pull-requests" | "issues",
  project: { readonly environmentId: string; readonly id: string },
) {
  return `${drillIn}:${project.environmentId}:${project.id}`;
}

function sidebarOpen(attached: AttachedThreadDetails) {
  return attached.presentation === "popover"
    ? useThreadDetailsStore.getState().popoverOpen
    : getClientSettings().threadDetailsOpen;
}

/** Runs against the sidebar on screen, or the next one to mount. */
export function withThreadDetails(action: (attached: AttachedThreadDetails) => void) {
  const { attached } = useThreadDetailsStore.getState();
  if (attached) action(attached);
  else
    useThreadDetailsStore.setState({
      pending: [...useThreadDetailsStore.getState().pending, action],
    });
}

/** Opens the sidebar wherever it shows, on the given drill-in. */
export function openThreadDetailsDrillIn(
  drillIn: ThreadDetailsDrillInId,
  options?: { readonly explicitListScope?: boolean },
) {
  withThreadDetails((attached) => {
    const wasOpen = sidebarOpen(attached);
    useThreadDetailsStore.setState({
      drillIn,
      explicitListScope:
        options?.explicitListScope && (drillIn === "pull-requests" || drillIn === "issues")
          ? drillIn
          : null,
      ...(attached.presentation === "popover"
        ? { popoverOpen: true }
        : { openedForDrillIn: !wasOpen }),
    });
    if (attached.presentation === "docked" && !wasOpen) {
      void updateClientSettings({ threadDetailsOpen: true });
    }
    requestWorkspaceFocus({ area: "details", selector: "[data-thread-details-back]" });
  });
}

/** Whether the sidebar on screen is showing this drill-in. */
export function isThreadDetailsDrillInShown(drillIn: ThreadDetailsDrillInId) {
  const { attached, drillIn: shown } = useThreadDetailsStore.getState();
  return attached !== null && shown === drillIn && sidebarOpen(attached);
}

export function useThreadDetailsDrillInShown(drillIn: ThreadDetailsDrillInId) {
  const dockedOpen = useClientSettings((settings) => settings.threadDetailsOpen);
  return useThreadDetailsStore(
    (state) =>
      state.attached !== null &&
      state.drillIn === drillIn &&
      (state.attached.presentation === "popover" ? state.popoverOpen : dockedOpen),
  );
}

/** Leaves a shown drill-in the way it came: a sidebar it opened closes again. */
export function toggleThreadDetailsDrillIn(drillIn: ThreadDetailsDrillInId) {
  const { attached, openedForDrillIn } = useThreadDetailsStore.getState();
  if (attached === null || !isThreadDetailsDrillInShown(drillIn)) {
    openThreadDetailsDrillIn(drillIn);
    return;
  }
  useThreadDetailsStore.setState({
    drillIn: null,
    openedForDrillIn: false,
    explicitListScope: null,
    ...(attached.presentation === "popover" ? { popoverOpen: false } : {}),
  });
  if (attached.presentation === "docked" && openedForDrillIn) {
    void updateClientSettings({ threadDetailsOpen: false });
  }
}

/** Whether this thread's list opens with the project filters an old page address saved. */
export function useExplicitListScope(
  threadRef: ScopedThreadRef,
  drillIn: "pull-requests" | "issues",
) {
  const key = scopedThreadKey(threadRef);
  return useThreadDetailsStore(
    (state) => state.scope === key && state.explicitListScope === drillIn,
  );
}
