import { EnvironmentId, MessageId } from "@s1tools/contracts";
import { type LegendListRef } from "@legendapp/list/react";
import { type ComponentProps, useState } from "react";
import { cdp } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { act, fakeTimers, render } from "../../../test/render";
import { MessagesTimeline } from "./MessagesTimeline";
import { forwardScrollGesturesToTimeline } from "./timelineMinimapWheel";
import { useTimelineFollow } from "./useTimelineFollow";

type Entry = ComponentProps<typeof MessagesTimeline>["timelineEntries"][number];

const CREATED_AT = "2026-03-17T19:12:28.000Z";
const ANCHOR_ID = MessageId.make("anchor");

function message(id: string, role: "user" | "assistant", text: string): Entry {
  return {
    id: `entry-${id}`,
    kind: "message",
    createdAt: CREATED_AT,
    message: {
      id: MessageId.make(id),
      role,
      text,
      runId: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      streaming: false,
    },
  };
}

/** Tall history, then the sent turn and its reply so far. */
function entries(reply: string): Entry[] {
  return [
    ...Array.from({ length: 24 }, (_, index) =>
      message(
        `history-${index}`,
        index % 2 === 0 ? "user" : "assistant",
        `History ${index}\n\n${"line ".repeat(160)}`,
      ),
    ),
    message("anchor", "user", "Sent turn"),
    message("reply", "assistant", reply),
  ];
}

/** A list ref that hands every scrollToIndex promise to the test, so it can await positioning. */
function recordingListRef(onScrollToIndex: (scroll: Promise<void>) => void) {
  let list: LegendListRef | null = null;
  return {
    get current() {
      return list;
    },
    set current(next: LegendListRef | null) {
      if (next) {
        const scrollToIndex = next.scrollToIndex.bind(next);
        next.scrollToIndex = (params) => {
          const scroll = scrollToIndex(params);
          onScrollToIndex(scroll);
          return scroll;
        };
      }
      list = next;
    },
  };
}

/** ChatView's wiring of follow to the timeline, without the rest of the chat. */
function FollowedTimeline(props: {
  readonly threadKey: string;
  readonly timelineEntries: Entry[];
  readonly composerInset: number;
  readonly anchored: boolean;
  readonly onAnchorSizeChanged: (size: number) => void;
  readonly onScrollToIndex: (scroll: Promise<void>) => void;
}) {
  const [listRef] = useState(() => recordingListRef(props.onScrollToIndex));
  const [anchor, setAnchor] = useState<{
    readonly threadKey: string | null;
    readonly messageId: MessageId | null;
  }>({ threadKey: props.threadKey, messageId: props.anchored ? ANCHOR_ID : null });
  const follow = useTimelineFollow({
    legendListRef: listRef,
    composerTimelineInset: props.composerInset,
    routeThreadKey: props.threadKey,
    activeThreadKey: props.threadKey,
    isServerThread: false,
    serverProjection: null,
    threadStatus: "live",
    activeActivityRun: null,
    timelineAnchorMessageId: anchor.messageId,
    setTimelineAnchor: setAnchor,
  });
  return (
    <div
      data-list-anchor-retired={follow.timelineListAnchorRetired}
      data-live-follow={follow.timelineLiveFollowEnabled}
      className="contents"
    >
      <MessagesTimeline
        timelineEntries={props.timelineEntries}
        isWorking
        listRef={listRef}
        latestRun={null}
        turnDiffSummaries={[]}
        runs={[]}
        routeThreadKey={props.threadKey}
        onOpenThread={() => {}}
        onForkFromRun={async () => {}}
        supportsConversationRollback={false}
        onRevertToTurnCount={() => {}}
        isRevertingCheckpoint={false}
        onImageExpand={() => {}}
        activeThreadEnvironmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot={undefined}
        anchorMessageId={anchor.messageId}
        anchorListRetired={follow.timelineListAnchorRetired}
        onAnchorReady={follow.onTimelineAnchorReadyStable}
        onAnchorSizeChanged={(messageId, size) => {
          follow.onTimelineAnchorSizeChangedStable(messageId, size);
          props.onAnchorSizeChanged(size);
        }}
        contentInsetEndAdjustment={props.composerInset}
        emptyPlaceholderInset={0}
        liveFollowEnabled={follow.timelineLiveFollowEnabled}
        onIsAtEndChange={follow.onIsAtEndChangeStable}
        onViewportAttach={follow.attachTimelineViewport}
      />
      {/* The composer backdrop's gesture forwarding, laid over the timeline's foot. */}
      <div
        data-testid="composer-gutter"
        style={{ position: "absolute", insetInline: 0, bottom: 0, height: 40 }}
        ref={(gutter) => {
          if (!gutter) return;
          return forwardScrollGesturesToTimeline(gutter, () =>
            listRef.current?.getScrollableNode(),
          );
        }}
      />
    </div>
  );
}

async function renderFollowedTimeline(reply: string, { anchored = true } = {}) {
  const threadKey = `environment-local:thread-${Math.random().toString(36).slice(2)}`;
  const onAnchorSizeChanged = vi.fn<(size: number) => void>();
  const scrollsToIndex: Promise<void>[] = [];
  const container = document.createElement("div");
  container.style.cssText =
    "position: relative; height: 900px; width: 900px; display: flex; flex-direction: column;";
  const ui = (text: string, composerInset = 0) => (
    <FollowedTimeline
      threadKey={threadKey}
      timelineEntries={entries(text)}
      composerInset={composerInset}
      anchored={anchored}
      onAnchorSizeChanged={onAnchorSizeChanged}
      onScrollToIndex={(scroll) => scrollsToIndex.push(scroll)}
    />
  );
  const screen = await render(ui(reply), { container });
  const viewport = () =>
    container.querySelector<HTMLElement>(".messages-timeline-scroll") ??
    (() => {
      throw new Error("Missing timeline viewport");
    })();
  const rowTop = (id: string) => {
    const row = container.querySelector(`[data-message-id="${id}"]`);
    return row ? row.getBoundingClientRect().top - viewport().getBoundingClientRect().top : null;
  };
  return Object.assign(screen, {
    container,
    viewport,
    rowTop,
    onAnchorSizeChanged,
    /** Resolves once every positioning scroll so far, and follow's reaction to it, is done. */
    positioned: async () => {
      await vi.waitFor(() => expect(scrollsToIndex.length).toBeGreaterThan(0));
      await Promise.all(scrollsToIndex);
    },
    showReply: (text: string, composerInset?: number) => screen.rerender(ui(text, composerInset)),
    gutter: () => container.querySelector<HTMLElement>('[data-testid="composer-gutter"]')!,
    listAnchorRetired: () =>
      container
        .querySelector("[data-list-anchor-retired]")
        ?.getAttribute("data-list-anchor-retired") === "true",
  });
}

/** Positioning scrolls without animation, so its effect lands on the frames a test advances. */
async function reduceMotion(): Promise<AsyncDisposable> {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  return {
    [Symbol.asyncDispose]: async () => {
      await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    },
  };
}

describe("an anchored turn", () => {
  it("does not pull a reader who scrolled into history back when the reply grows", async () => {
    await using _motion = await reduceMotion();
    await using screen = await renderFollowedTimeline("First words.");
    await vi.waitFor(() => expect(screen.rowTop("anchor")).toBeLessThan(100));

    // The reader wheels up into earlier history.
    const viewport = screen.viewport();
    await act(() => {
      viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -600, bubbles: true }));
      viewport.scrollTop = Math.max(0, viewport.scrollTop - 1500);
      viewport.dispatchEvent(new Event("scroll"));
    });
    await vi.waitFor(() => expect(screen.rowTop("anchor") ?? Infinity).toBeGreaterThan(900));
    const scrollTop = viewport.scrollTop;

    using _timers = fakeTimers();
    const sizeChanges = screen.onAnchorSizeChanged.mock.calls.length;
    await screen.showReply(`First words.\n\n${"More of the reply. ".repeat(20)}`);
    // The list has measured the longer reply and re-reported its end space.
    await vi.waitFor(() =>
      expect(screen.onAnchorSizeChanged.mock.calls.length).toBeGreaterThan(sizeChanges),
    );
    await act(() => vi.advanceTimersByTime(1_000));

    expect(Math.abs(viewport.scrollTop - scrollTop)).toBeLessThan(2);
    expect(screen.rowTop("anchor") ?? Infinity).toBeGreaterThan(900);
  });

  it("lets the list drop its anchor once the reply fills the view, still holding the turn", async () => {
    await using _motion = await reduceMotion();
    const reply = `Long reply.\n\n${"word ".repeat(2_000)}`;
    await using screen = await renderFollowedTimeline(reply);
    const retired = () =>
      screen.container
        .querySelector("[data-list-anchor-retired]")
        ?.getAttribute("data-list-anchor-retired") === "true";
    // The list no longer pins every row from the anchor down (see getAlwaysRenderIndices).
    await vi.waitFor(() => expect(retired()).toBe(true));
    const anchorTop = screen.rowTop("anchor");
    expect(anchorTop).not.toBeNull();
    expect(anchorTop!).toBeLessThan(100);

    // The turn stays anchored: more reply does not drag the view to the end.
    await screen.showReply(`${reply}\n\n${"more ".repeat(2_000)}`);
    await vi.waitFor(() => expect(screen.container.textContent).toContain("more more"));
    expect(screen.rowTop("anchor")).toBe(anchorTop);
  });

  it("drops the list anchor when the composer grows over the end space, holding the turn", async () => {
    await using _motion = await reduceMotion();
    await using screen = await renderFollowedTimeline("First words.");
    await vi.waitFor(() => expect(screen.rowTop("anchor")).toBeLessThan(100));
    // Let positioning settle, so only the inset change below can retire the anchor.
    await screen.positioned();
    expect(screen.listAnchorRetired()).toBe(false);
    const anchorTop = screen.rowTop("anchor");
    const sizeChanges = screen.onAnchorSizeChanged.mock.calls.length;
    const endSpace = screen.onAnchorSizeChanged.mock.lastCall?.[0] ?? 0;
    expect(endSpace).toBeGreaterThan(0);

    // Same reply; only the composer grows, exactly over the end space so the list keeps its
    // scroll range and moves nothing itself.
    await screen.showReply("First words.", Math.ceil(endSpace));
    await vi.waitFor(() => expect(screen.listAnchorRetired()).toBe(true));
    expect(screen.rowTop("anchor")).toBe(anchorTop);
    // The list sizes its end space without the inset, so it reported nothing new.
    expect(screen.onAnchorSizeChanged.mock.calls.length).toBe(sizeChanges);
  });
});

describe("the live end", () => {
  function touch(type: string, target: HTMLElement, clientY: number | null): TouchEvent {
    const touches =
      clientY === null ? [] : [new Touch({ identifier: 1, target, clientX: 10, clientY })];
    return new TouchEvent(type, { cancelable: true, touches, changedTouches: touches });
  }

  it("lets go of a reader who drags a covering gutter once into history", async () => {
    await using _motion = await reduceMotion();
    await using screen = await renderFollowedTimeline("First words.", { anchored: false });
    const viewport = screen.viewport();
    const distanceFromEnd = () =>
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
    await vi.waitFor(() => expect(distanceFromEnd()).toBeLessThan(2));

    // One move, so the only navigation the timeline hears comes while it is still at the end.
    const gutter = screen.gutter();
    await act(() => {
      gutter.dispatchEvent(touch("touchstart", gutter, 100));
      gutter.dispatchEvent(touch("touchmove", gutter, 700));
      gutter.dispatchEvent(touch("touchend", gutter, null));
    });
    await vi.waitFor(() => expect(distanceFromEnd()).toBeGreaterThan(500));
    const scrollTop = viewport.scrollTop;
    expect(
      screen.container.querySelector("[data-live-follow]")?.getAttribute("data-live-follow"),
    ).toBe("false");

    using _timers = fakeTimers();
    await screen.showReply(`First words.\n\n${"More of the reply. ".repeat(80)}`);
    await vi.waitFor(() => expect(screen.container.textContent).toContain("More of the reply."));
    await act(() => vi.advanceTimersByTime(1_000));
    expect(Math.abs(viewport.scrollTop - scrollTop)).toBeLessThan(2);
  });
});
