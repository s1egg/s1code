import { createStore } from "zustand";
import { resolveChatCanvasLayout, type ChatCanvasPreview } from "./chatCanvasLayout";

interface CanvasEdges {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ChatCanvasMeasurements {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly maxChatWidth: number;
  readonly maxHtmlPreviewWidth: number;
  readonly minChatWidth: number;
  readonly composerHeight: number;
  readonly timelineGutter: number;
  /** The find bar's box in canvas coordinates while it is shown. */
  readonly findBar: CanvasEdges | null;
}

interface ChatCanvasStoreState {
  readonly measurements: ChatCanvasMeasurements;
  readonly measurementsByRightPanel: Partial<Record<"open" | "closed", ChatCanvasMeasurements>>;
  readonly setMeasurements: (next: ChatCanvasMeasurements, rightPanelOpen: boolean) => void;
}

const INITIAL_MEASUREMENTS: ChatCanvasMeasurements = {
  width: 0,
  height: 0,
  padding: 48,
  maxChatWidth: 768,
  maxHtmlPreviewWidth: 768,
  minChatWidth: 640,
  composerHeight: 0,
  timelineGutter: 0,
  findBar: null,
};

const sameEdges = (a: CanvasEdges | null, b: CanvasEdges | null) =>
  a === b ||
  (a !== null && b !== null && a.left === b.left && a.right === b.right && a.bottom === b.bottom);

const sameMeasurements = (a: ChatCanvasMeasurements, b: ChatCanvasMeasurements) =>
  a.width === b.width &&
  a.height === b.height &&
  a.padding === b.padding &&
  a.maxChatWidth === b.maxChatWidth &&
  a.maxHtmlPreviewWidth === b.maxHtmlPreviewWidth &&
  a.minChatWidth === b.minChatWidth &&
  a.composerHeight === b.composerHeight &&
  a.timelineGutter === b.timelineGutter &&
  sameEdges(a.findBar, b.findBar);

/** One store per chat view, so the canvas keeps its measurements across thread switches. */
export const createChatCanvasStore = () =>
  createStore<ChatCanvasStoreState>()((set) => ({
    measurements: INITIAL_MEASUREMENTS,
    measurementsByRightPanel: {},
    setMeasurements: (next, rightPanelOpen) =>
      set((state) => {
        const key = rightPanelOpen ? "open" : "closed";
        const known = state.measurementsByRightPanel[key];
        const measurements = known && sameMeasurements(known, next) ? known : next;
        if (measurements === known && measurements === state.measurements) return state;
        return {
          measurements,
          measurementsByRightPanel: { ...state.measurementsByRightPanel, [key]: measurements },
        };
      }),
  }));

export type ChatCanvasStore = ReturnType<typeof createChatCanvasStore>;

export const selectCanvasMeasurements = (state: ChatCanvasStoreState, rightPanelOpen: boolean) =>
  state.measurementsByRightPanel[rightPanelOpen ? "open" : "closed"] ?? state.measurements;

export function resolveChatCanvasModel({
  measurements,
  preview,
}: {
  measurements: ChatCanvasMeasurements;
  preview: ChatCanvasPreview | null;
}) {
  const container = { width: measurements.width, height: measurements.height };
  const lane = { padding: measurements.padding, minChatWidth: measurements.minChatWidth };
  const layout = resolveChatCanvasLayout({
    container,
    preview,
    padding: measurements.padding,
    maxChatWidth: measurements.maxChatWidth,
    maxHtmlPreviewWidth: measurements.maxHtmlPreviewWidth,
    minChatWidth: measurements.minChatWidth,
    composerHeight: measurements.composerHeight,
    findBar: measurements.findBar,
  });
  return { container, lane, layout };
}
