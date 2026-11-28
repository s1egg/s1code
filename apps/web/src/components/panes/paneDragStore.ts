import { create } from "zustand";

import type { PaneKind } from "../../paneLayout";

/**
 * Desktop browser panes are native views drawn above the page. While a pane is dragged they hide
 * so the drop zones and ghost stay visible, and every layout change bumps the revision so a view
 * whose tile moved without resizing is placed again.
 */
interface PaneDragStore {
  readonly dragging: PaneKind | null;
  readonly layoutRevision: number;
  setDragging: (pane: PaneKind | null) => void;
  bumpLayoutRevision: () => void;
}

export const usePaneDragStore = create<PaneDragStore>()((set) => ({
  dragging: null,
  layoutRevision: 0,
  setDragging: (dragging) => set({ dragging }),
  bumpLayoutRevision: () => set((state) => ({ layoutRevision: state.layoutRevision + 1 })),
}));
