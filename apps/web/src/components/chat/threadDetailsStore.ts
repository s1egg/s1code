import { create } from "zustand";

/** Views that open inside the thread details sidebar in place of its sections. */
export type ThreadDetailsDrillInId = "context";

interface ThreadDetailsStoreState {
  /** The popover form, shown while the right panel is open or the window is narrow. */
  readonly popoverOpen: boolean;
  readonly drillIn: ThreadDetailsDrillInId | null;
  readonly setPopoverOpen: (open: boolean) => void;
  readonly setDrillIn: (drillIn: ThreadDetailsDrillInId | null) => void;
}

// Not persisted: the docked open state is the threadDetailsOpen client setting, and a popover or
// drill-in left open should not reappear unasked after a reload.
export const useThreadDetailsStore = create<ThreadDetailsStoreState>()((set) => ({
  popoverOpen: false,
  drillIn: null,
  setPopoverOpen: (popoverOpen) => set({ popoverOpen }),
  setDrillIn: (drillIn) => set({ drillIn }),
}));
