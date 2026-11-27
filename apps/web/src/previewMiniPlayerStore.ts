import { scopedThreadKey } from "@s1tools/client-runtime/environment";
import type { DevicePlatform, ScopedThreadRef } from "@s1tools/contracts";
import { create } from "zustand";

export interface PreviewMiniPlayerPosition {
  readonly x: number;
  readonly y: number;
}

export interface PreviewMiniPlayerSize {
  readonly width: number;
  readonly height: number;
}

export type PreviewMiniPlayerSource =
  | { readonly kind: "browser"; readonly tabId: string }
  | {
      readonly kind: "device";
      readonly hostId: string;
      readonly deviceId: string;
      readonly platform: DevicePlatform;
      readonly name: string;
    };

/** Where the user dragged and sized a thread's floating preview. */
export interface PreviewMiniPlayerGeometry {
  readonly position: PreviewMiniPlayerPosition | null;
  readonly width: number | null;
  readonly lastInteraction: "drag" | "resize";
}

/**
 * A floating Browser or Device pane as the player draws it. Which page or device floats is the
 * minimized pane's item in the right panel store; this store only keeps the frame's geometry.
 */
export interface PreviewMiniPlayerState extends PreviewMiniPlayerGeometry {
  readonly source: PreviewMiniPlayerSource;
}

const DEFAULT_GEOMETRY: PreviewMiniPlayerGeometry = {
  position: null,
  width: null,
  lastInteraction: "drag",
};

interface PreviewMiniPlayerStoreState {
  readonly byThreadKey: Record<string, PreviewMiniPlayerGeometry>;
  readonly move: (ref: ScopedThreadRef, position: PreviewMiniPlayerPosition) => void;
  readonly resize: (
    ref: ScopedThreadRef,
    width: number,
    position?: PreviewMiniPlayerPosition,
  ) => void;
  readonly removeThread: (ref: ScopedThreadRef) => void;
}

export function previewMiniPlayerSourceKey(source: PreviewMiniPlayerSource): string {
  return source.kind === "browser"
    ? `browser:${source.tabId}`
    : `device:${encodeURIComponent(source.hostId)}:${encodeURIComponent(source.deviceId)}`;
}

export const browserMiniPlayerSource = (tabId: string): PreviewMiniPlayerSource => ({
  kind: "browser",
  tabId,
});

export const usePreviewMiniPlayerStore = create<PreviewMiniPlayerStoreState>()((set) => ({
  byThreadKey: {},
  move: (ref, position) =>
    set((state) => {
      const threadKey = scopedThreadKey(ref);
      const current = state.byThreadKey[threadKey] ?? DEFAULT_GEOMETRY;
      if (
        current.position?.x === position.x &&
        current.position.y === position.y &&
        current.lastInteraction === "drag"
      )
        return state;
      return {
        byThreadKey: {
          ...state.byThreadKey,
          [threadKey]: { ...current, position, lastInteraction: "drag" },
        },
      };
    }),
  resize: (ref, width, position) =>
    set((state) => {
      const threadKey = scopedThreadKey(ref);
      const current = state.byThreadKey[threadKey] ?? DEFAULT_GEOMETRY;
      if (
        current.width === width &&
        current.lastInteraction === "resize" &&
        (!position || (current.position?.x === position.x && current.position.y === position.y))
      ) {
        return state;
      }
      return {
        byThreadKey: {
          ...state.byThreadKey,
          [threadKey]: {
            ...current,
            width,
            position: position ?? current.position,
            lastInteraction: "resize",
          },
        },
      };
    }),
  removeThread: (ref) =>
    set((state) => {
      const threadKey = scopedThreadKey(ref);
      if (!(threadKey in state.byThreadKey)) return state;
      const { [threadKey]: _removed, ...byThreadKey } = state.byThreadKey;
      return { byThreadKey };
    }),
}));

export function selectThreadPreviewMiniPlayerGeometry(
  byThreadKey: Record<string, PreviewMiniPlayerGeometry>,
  ref: ScopedThreadRef | null | undefined,
): PreviewMiniPlayerGeometry {
  if (!ref) return DEFAULT_GEOMETRY;
  return byThreadKey[scopedThreadKey(ref)] ?? DEFAULT_GEOMETRY;
}
