import { describe, expect, it, vi } from "vite-plus/test";

import { fakeTimers } from "../../../test/render";
import { forwardScrollGesturesToTimeline, forwardWheelToTimeline } from "./timelineMinimapWheel";
import { attachTimelineViewport, type TimelineNavigation } from "./timelineViewport";

function mountTimeline() {
  const timeline = document.createElement("div");
  timeline.style.cssText = "height: 200px; overflow-y: auto;";
  const content = document.createElement("div");
  content.style.height = "2000px";
  timeline.append(content);
  document.body.append(timeline);
  return Object.assign(timeline, { [Symbol.dispose]: () => timeline.remove() });
}

function wheel(deltaY: number, wheelDeltaY: number): WheelEvent {
  const init = { cancelable: true, deltaY, wheelDeltaY };
  return new WheelEvent("wheel", init);
}

describe("forwardWheelToTimeline", () => {
  it.each([
    ["macOS", -360],
    ["Linux and Windows", -120],
  ])("scrolls %s trackpad deltas immediately", (_platform, wheelDeltaY) => {
    using timeline = mountTimeline();
    forwardWheelToTimeline(wheel(120, wheelDeltaY), timeline);
    expect(timeline.scrollTop).toBe(120);
  });

  it("glides mouse wheel notches and accumulates them", () => {
    using timeline = mountTimeline();
    using _timers = fakeTimers();
    forwardWheelToTimeline(wheel(100, -120), timeline);
    forwardWheelToTimeline(wheel(100, -120), timeline);
    expect(timeline.scrollTop).toBe(0);
    vi.advanceTimersByTime(75);
    expect(timeline.scrollTop).toBeGreaterThan(0);
    expect(timeline.scrollTop).toBeLessThan(200);
    vi.advanceTimersByTime(100);
    expect(timeline.scrollTop).toBe(200);
  });

  it("stops gliding when the user clicks or navigates", () => {
    using timeline = mountTimeline();
    using _timers = fakeTimers();
    forwardWheelToTimeline(wheel(100, -120), timeline);
    vi.advanceTimersByTime(50);
    timeline.scrollTop = 1000;
    window.dispatchEvent(new PointerEvent("pointerdown"));
    vi.advanceTimersByTime(200);
    expect(timeline.scrollTop).toBe(1000);
  });
});

describe("forwardScrollGesturesToTimeline", () => {
  function touch(type: string, target: HTMLElement, clientY: number | null): TouchEvent {
    const touches =
      clientY === null ? [] : [new Touch({ identifier: 1, target, clientX: 10, clientY })];
    return new TouchEvent(type, { cancelable: true, touches, changedTouches: touches });
  }

  it("scrolls the timeline for a drag or wheel on a covering gutter", () => {
    using timeline = mountTimeline();
    const gutter = document.createElement("div");
    document.body.append(gutter);
    const stop = forwardScrollGesturesToTimeline(gutter, () => timeline);
    using _gutter = { [Symbol.dispose]: () => (stop(), gutter.remove()) };
    const viewport = attachTimelineViewport(timeline);
    using _viewport = { [Symbol.dispose]: () => viewport.dispose() };
    const navigations = vi.fn<(navigation: TimelineNavigation) => void>();
    viewport.subscribe(navigations);

    gutter.dispatchEvent(touch("touchstart", gutter, 300));
    const move = touch("touchmove", gutter, 220);
    gutter.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
    expect(timeline.scrollTop).toBe(80);
    // The viewport hears the drag as the reader's own touch, direction included, so it can
    // release follow before the scroll lands.
    expect(navigations.mock.calls).toEqual([[{ source: "touch", direction: "down" }]]);
    gutter.dispatchEvent(touch("touchend", gutter, null));
    gutter.dispatchEvent(touch("touchmove", gutter, 100));
    expect(timeline.scrollTop).toBe(80);

    gutter.dispatchEvent(wheel(40, -120 / 3));
    expect(timeline.scrollTop).toBe(120);
  });
});
