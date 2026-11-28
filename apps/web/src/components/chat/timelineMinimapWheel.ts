import { reportTimelineTouchDrag } from "./timelineViewport";

const MOUSE_WHEEL_SCROLL_MS = 150;
const PRECISE_WHEEL_DELTA_RATIOS = [1, 3];

interface WheelGlide {
  from: number;
  to: number;
  start: number;
  written: number;
  frame: number;
  interruptions: AbortController;
}

const glides = new WeakMap<HTMLElement, WheelGlide>();

function isPreciseWheel(event: WheelEvent): boolean {
  if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
  const { wheelDeltaY } = event as WheelEvent & { wheelDeltaY?: number };
  return (
    wheelDeltaY === undefined ||
    PRECISE_WHEEL_DELTA_RATIOS.some((ratio) => Math.abs(wheelDeltaY + ratio * event.deltaY) < 1)
  );
}

function stopGlide(timeline: HTMLElement): WheelGlide | undefined {
  const glide = glides.get(timeline);
  if (!glide) return undefined;
  cancelAnimationFrame(glide.frame);
  glide.interruptions.abort();
  glides.delete(timeline);
  return glide;
}

function glideBy(timeline: HTMLElement, distance: number): void {
  const current = stopGlide(timeline);
  const scrollTop = timeline.scrollTop;
  const base = current ? current.to + scrollTop - current.written : scrollTop;
  const maxScrollTop = timeline.scrollHeight - timeline.clientHeight;
  const glide: WheelGlide = {
    from: scrollTop,
    to: Math.max(0, Math.min(maxScrollTop, base + distance)),
    start: performance.now(),
    written: scrollTop,
    frame: 0,
    interruptions: new AbortController(),
  };
  for (const type of ["pointerdown", "keydown"]) {
    window.addEventListener(type, () => stopGlide(timeline), {
      capture: true,
      signal: glide.interruptions.signal,
    });
  }
  const step = (time: number) => {
    if (!timeline.isConnected) {
      stopGlide(timeline);
      return;
    }
    const drift = timeline.scrollTop - glide.written;
    glide.from += drift;
    glide.to += drift;
    const progress = Math.min(1, Math.max(0, (time - glide.start) / MOUSE_WHEEL_SCROLL_MS));
    timeline.scrollTop = glide.from + (glide.to - glide.from) * (1 - (1 - progress) ** 3);
    glide.written = timeline.scrollTop;
    if (progress < 1) {
      glide.frame = requestAnimationFrame(step);
    } else {
      stopGlide(timeline);
    }
  };
  glide.frame = requestAnimationFrame(step);
  glides.set(timeline, glide);
}

export function forwardWheelToTimeline(event: WheelEvent, timeline: HTMLElement): void {
  if (event.defaultPrevented || event.ctrlKey || event.deltaY === 0) return;
  event.preventDefault();

  const forwarded = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    altKey: event.altKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  });
  if (!timeline.dispatchEvent(forwarded)) return;

  const pixelsPerUnit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? timeline.clientHeight
        : 1;
  const distance = event.deltaY * pixelsPerUnit;
  if (isPreciseWheel(event) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stopGlide(timeline);
    timeline.scrollBy({ top: distance });
    return;
  }
  glideBy(timeline, distance);
}

/**
 * For surfaces that cover the timeline without being part of it (the composer's backdrop and
 * bottom spacer): wheel and one-finger drags scroll the timeline, while clicks stay blocked.
 */
export function forwardScrollGesturesToTimeline(
  element: HTMLElement,
  getTimeline: () => HTMLElement | null | undefined,
): () => void {
  const onWheel = (event: WheelEvent) => {
    const timeline = getTimeline();
    if (timeline) forwardWheelToTimeline(event, timeline);
  };
  let lastTouchY: number | null = null;
  const onTouchStart = (event: TouchEvent) => {
    lastTouchY = event.touches.length === 1 ? event.touches[0]!.clientY : null;
  };
  const onTouchMove = (event: TouchEvent) => {
    const timeline = getTimeline();
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    if (lastTouchY === null || !timeline || !touch) return;
    event.preventDefault();
    const distance = lastTouchY - touch.clientY;
    // The timeline hears it as its own touch, so the drag can release follow like one.
    if (distance !== 0) reportTimelineTouchDrag(timeline, distance < 0 ? "up" : "down");
    stopGlide(timeline);
    timeline.scrollBy({ top: distance });
    lastTouchY = touch.clientY;
  };
  const onTouchEnd = () => {
    lastTouchY = null;
  };
  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("touchstart", onTouchStart, { passive: true });
  element.addEventListener("touchmove", onTouchMove, { passive: false });
  element.addEventListener("touchend", onTouchEnd, { passive: true });
  element.addEventListener("touchcancel", onTouchEnd, { passive: true });
  return () => {
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("touchstart", onTouchStart);
    element.removeEventListener("touchmove", onTouchMove);
    element.removeEventListener("touchend", onTouchEnd);
    element.removeEventListener("touchcancel", onTouchEnd);
  };
}
