import { useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties } from "react";
import { useStore } from "zustand";
import { ChatCanvasContext } from "./ChatCanvasContext";
import type { ChatCanvasPreview } from "./chatCanvasLayout";
import { resolveChatCanvasModel, type ChatCanvasStore } from "./canvasStore";
import { observeResize } from "../../lib/observeResize";

export function ChatCanvas({
  store,
  preview,
  composerOverlayElement,
  findBarOpen = false,
  children,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style" | "ref"> & {
  store: ChatCanvasStore;
  /** The thread's mini player while it renders on this canvas. */
  preview: ChatCanvasPreview | null;
  composerOverlayElement: HTMLElement | null;
  /** The mini player keeps clear of the find bar while it shows. */
  findBarOpen?: boolean;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const widthProbeRef = useRef<HTMLDivElement | null>(null);
  const htmlPreviewWidthProbeRef = useRef<HTMLDivElement | null>(null);
  const [timelineElement, registerTimeline] = useState<HTMLElement | null>(null);
  const measurements = useStore(store, (state) => state.measurements);
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- observes canvas, find bar and timeline resizes and writes the measurements to the canvas store
  useLayoutEffect(() => {
    const element = elementRef.current;
    const probe = widthProbeRef.current;
    const htmlPreviewProbe = htmlPreviewWidthProbeRef.current;
    if (!element || !probe || !htmlPreviewProbe) return;
    const findBar = findBarOpen
      ? element.querySelector<HTMLElement>("[data-thread-find-bar]")
      : null;
    const measure = () => {
      const canvasBounds = element.getBoundingClientRect();
      const findBarBounds = findBar?.getBoundingClientRect();
      const styles = getComputedStyle(probe);
      store.getState().setMeasurements({
        findBar: findBarOpen
          ? {
              left: findBarBounds ? findBarBounds.left - canvasBounds.left : 0,
              right: findBarBounds ? findBarBounds.right - canvasBounds.left : 0,
              bottom: findBarBounds ? findBarBounds.bottom - canvasBounds.top : 0,
            }
          : null,
        width: element.clientWidth,
        height: element.clientHeight,
        padding: Number.parseFloat(styles.paddingLeft),
        maxChatWidth: Number.parseFloat(styles.width),
        maxHtmlPreviewWidth: Number.parseFloat(getComputedStyle(htmlPreviewProbe).width),
        minChatWidth: Number.parseFloat(styles.minWidth),
        composerHeight: composerOverlayElement?.getBoundingClientRect().height ?? 0,
        timelineGutter: timelineElement
          ? (timelineElement.offsetWidth - timelineElement.clientWidth) / 2
          : 0,
      });
    };
    measure();
    const observed: Element[] = [element, probe, htmlPreviewProbe];
    if (findBar) observed.push(findBar);
    if (composerOverlayElement) observed.push(composerOverlayElement);
    if (timelineElement) observed.push(timelineElement);
    return observeResize(observed, measure);
  }, [store, composerOverlayElement, timelineElement, findBarOpen]);
  const model = resolveChatCanvasModel({ measurements, preview });
  const context = {
    container: model.container,
    lane: model.lane,
    layout: model.layout,
    previewKey: preview?.key ?? null,
    registerTimeline,
  };
  const { layout } = context;
  const htmlPreviewLane =
    layout.htmlPreview.width > layout.chat.width
      ? {
          "--html-preview-lane-offset": `${layout.htmlPreview.left - layout.chat.left}px`,
          "--html-preview-lane-width": `${layout.htmlPreview.width}px`,
        }
      : null;
  return (
    <ChatCanvasContext value={context}>
      <div
        {...props}
        ref={elementRef}
        data-chat-canvas
        data-preview-overlaps-chat={layout.overlapsChat || undefined}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        style={
          {
            "--chat-timeline-gutter": `${measurements.timelineGutter}px`,
            "--chat-lane-inset-start": `${layout.chat.insetStart}px`,
            "--chat-lane-inset-end": `${layout.chat.insetEnd}px`,
            ...htmlPreviewLane,
          } as CSSProperties
        }
      >
        <div
          ref={widthProbeRef}
          aria-hidden
          className="pointer-events-none invisible absolute h-0 w-(--chat-content-max-width) min-w-[40rem] box-content ps-3 sm:ps-12"
        />
        <div
          ref={htmlPreviewWidthProbeRef}
          aria-hidden
          className="pointer-events-none invisible absolute h-0 w-(--html-preview-max-width)"
        />
        {children}
      </div>
    </ChatCanvasContext>
  );
}
