import { describe, expect, it } from "vite-plus/test";
import {
  createChatCanvasStore,
  selectCanvasMeasurements,
  type ChatCanvasMeasurements,
} from "./canvasStore";

const measurements = (width: number, height = 900): ChatCanvasMeasurements => ({
  width,
  height,
  padding: 48,
  maxChatWidth: 768,
  maxHtmlPreviewWidth: 768,
  minChatWidth: 640,
  composerHeight: 180,
  timelineGutter: 0,
  findBar: null,
});

describe("chat canvas store", () => {
  it("keeps state identity when a measurement repeats", () => {
    const store = createChatCanvasStore();
    store.getState().setMeasurements(measurements(1400), false);
    const before = store.getState();
    store.getState().setMeasurements(measurements(1400), false);
    expect(store.getState()).toBe(before);
    store.getState().setMeasurements(measurements(1200), false);
    expect(store.getState().measurements.width).toBe(1200);
  });

  it("lays out with the width last measured for the right panel's state", () => {
    const store = createChatCanvasStore();
    store.getState().setMeasurements(measurements(1400), false);
    expect(selectCanvasMeasurements(store.getState(), true).width).toBe(1400);
    store.getState().setMeasurements(measurements(860), true);
    store.getState().setMeasurements(measurements(1400), false);
    const closed = store.getState();
    expect(selectCanvasMeasurements(closed, true).width).toBe(860);
    store.getState().setMeasurements(measurements(860), true);
    expect(selectCanvasMeasurements(store.getState(), true)).toBe(
      selectCanvasMeasurements(closed, true),
    );
  });
});
