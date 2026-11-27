import { useRef } from "react";

import { observeResize } from "~/lib/observeResize";

// AppSidebarLayout owns this so drawer and Settings remounts keep a pending reveal.
// Only route changes may move the rail selection; scroll position is lost on remount.
// Leaving Settings commits the router's location before its matches, briefly hiding thread params.
// Ignore null keys so the same thread does not look new during that gap.
export interface SidebarRouteReveal {
  observedKey: string | null;
  pendingKey: string | null;
  // A draft's first send names its thread without navigating; the user is not looking for it.
  pendingInPlace?: boolean;
  // Selecting the route's project is owed apart from the scroll: the rail settles it once it
  // can place the route, even when that project is already selected, and a rail click drops it.
  projectPending?: boolean;
}

export function pendingSidebarRouteReveal(
  reveal: SidebarRouteReveal,
  routeKey: string | null,
  inPlace = false,
): string | null {
  if (routeKey === null) return null;
  if (reveal.observedKey !== routeKey) {
    reveal.observedKey = routeKey;
    reveal.pendingKey = routeKey;
    reveal.pendingInPlace = inPlace;
    reveal.projectPending = true;
  }
  return reveal.pendingKey;
}

export function completeSidebarRouteReveal(reveal: SidebarRouteReveal): void {
  reveal.pendingKey = null;
}

export function completeSidebarProjectReveal(reveal: SidebarRouteReveal): void {
  reveal.projectPending = false;
}

// Each route change and each mount scroll to the open thread once. Render records
// the route, so a thread left before its row mounted still counts as a change.
// The row can mount after the route, once its shells arrive, so its ref scrolls.
export function useActiveRowReveal(
  reveal: SidebarRouteReveal,
  routeKey: string | null,
  inPlace = false,
) {
  const mountRevealOwed = useRef(true);
  pendingSidebarRouteReveal(reveal, routeKey, inPlace);
  // Returns a ref cleanup while it waits on a hidden row, so an unmount releases the wait.
  const revealRow = (row: HTMLElement | null, rowKey: string): (() => void) | undefined => {
    if (row === null) return undefined;
    if (reveal.pendingKey !== rowKey && !mountRevealOwed.current) return undefined;
    const revealInPlace = reveal.pendingKey === rowKey && reveal.pendingInPlace === true;
    // A row under the pointer was just clicked, so it is in view. Both cases skip the scroll,
    // so settle them before measuring: this runs mid-commit, where a measure forces layout.
    if (revealInPlace || row.matches(":hover")) {
      completeSidebarRouteReveal(reveal);
      mountRevealOwed.current = false;
      return undefined;
    }
    // The closed narrow sheet keeps rows mounted but hidden, and opening it does not
    // re-render them, so wait for the row to get a box before spending the reveal.
    if (row.getClientRects().length === 0) {
      const stopWaiting = observeResize(row, () => {
        if (row.getClientRects().length === 0) return;
        stopWaiting();
        revealRow(row, rowKey);
      });
      return stopWaiting;
    }
    completeSidebarRouteReveal(reveal);
    mountRevealOwed.current = false;
    // Keyboard activation can come from a focused row scrolled out of view.
    row.scrollIntoView({ block: "nearest" });
    return undefined;
  };
  return revealRow;
}

// Render records the route before deciding, so the first render of a new route
// already follows it. Only a route change follows: the once-per-mount scroll never
// changes a selection the user made.
export function resolveSidebarRouteReveal(input: {
  readonly reveal: SidebarRouteReveal;
  readonly routeKey: string | null;
  readonly routeKeyInPlace: boolean;
  readonly isSearching: boolean;
  /** The rail entry that lists the open thread or draft, once it can be placed. */
  readonly routeRailKey: string | null;
  readonly selectedRailKey: string | null;
}): { readonly followsRoute: boolean; readonly settledRailKey: string | null } {
  pendingSidebarRouteReveal(input.reveal, input.routeKey, input.routeKeyInPlace);
  // Search results replace the thread list; the reveal waits for it to return.
  if (input.reveal.projectPending !== true || input.isSearching || input.routeRailKey === null) {
    return { followsRoute: false, settledRailKey: null };
  }
  return {
    followsRoute: input.routeRailKey !== input.selectedRailKey,
    settledRailKey: input.routeRailKey,
  };
}
