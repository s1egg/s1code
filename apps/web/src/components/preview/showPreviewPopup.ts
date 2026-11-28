import type { ScopedThreadRef } from "@s1tools/contracts";

import { whenPreviewTabKnown } from "~/previewStateStore";
import { browserSurface, useRightPanelStore } from "~/rightPanelStore";

export function showPreviewPopup(
  threadRef: ScopedThreadRef,
  popupTabId: string,
  from: "panel" | "floating",
): void {
  whenPreviewTabKnown(threadRef, popupTabId, () => {
    if (from === "floating") {
      useRightPanelStore.getState().floatSurface(threadRef, browserSurface(popupTabId));
    } else {
      useRightPanelStore.getState().openBrowser(threadRef, popupTabId);
    }
  });
}
