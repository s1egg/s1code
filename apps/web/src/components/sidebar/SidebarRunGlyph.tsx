import type { AnimationEventHandler } from "react";

import { cn } from "../../lib/utils";

/**
 * A static mark: a sparkle while the agent runs, a closed amber ring while it waits on the
 * user. Static on purpose; a looping glyph would repaint every frame. `twinkle` plays the
 * sparkle's one-shot entrance.
 */
export function SidebarRunGlyph(props: {
  waiting: boolean;
  className: string;
  twinkle?: boolean;
  onAnimationEnd?: AnimationEventHandler<SVGSVGElement>;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      data-run-glyph={props.waiting ? "waiting" : "running"}
      data-twinkle={!props.waiting && props.twinkle ? "" : undefined}
      onAnimationEnd={props.onAnimationEnd}
      className={cn(
        "shrink-0 data-twinkle:sidebar-twinkle",
        props.waiting ? "text-warning-foreground" : "text-sidebar-foreground/65",
        props.className,
      )}
    >
      {props.waiting ? (
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2.5" />
      ) : (
        <path
          d="M8 1Q8.5 7.5 15 8Q8.5 8.5 8 15Q7.5 8.5 1 8Q7.5 7.5 8 1Z"
          fill="currentColor"
          strokeLinejoin="round"
          paintOrder="stroke"
        />
      )}
    </svg>
  );
}
