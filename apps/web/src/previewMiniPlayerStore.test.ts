import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@s1tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  selectThreadPreviewMiniPlayerGeometry,
  usePreviewMiniPlayerStore,
} from "./previewMiniPlayerStore";

const refA = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));
const refB = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-B"));

beforeEach(() => {
  usePreviewMiniPlayerStore.setState({ byThreadKey: {} });
});

describe("previewMiniPlayerStore", () => {
  it("keeps where each thread's floating preview was dragged and sized", () => {
    const store = usePreviewMiniPlayerStore.getState();
    store.move(refA, { x: 100, y: 80 });
    store.resize(refA, 360);
    const geometry = (ref: typeof refA) =>
      selectThreadPreviewMiniPlayerGeometry(usePreviewMiniPlayerStore.getState().byThreadKey, ref);
    expect(geometry(refA)).toEqual({
      position: { x: 100, y: 80 },
      width: 360,
      lastInteraction: "resize",
    });
    expect(geometry(refB)).toEqual({ position: null, width: null, lastInteraction: "drag" });
    store.removeThread(refA);
    expect(geometry(refA).position).toBeNull();
  });
});
