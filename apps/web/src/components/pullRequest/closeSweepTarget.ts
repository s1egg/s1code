/**
 * The pull request row a close sweep at `y` reaches: among the rows the list's scroller shows, the
 * last one starting at or above `y`, or the first shown row when `y` is above them all. A sweep
 * never takes rows offscreen, and reaches nothing when no row shows.
 */
export function closeSweepRowKeyAt(list: Element, y: number): string | null {
  const listBounds = list.getBoundingClientRect();
  const scroller = list.parentElement?.closest('[data-slot="scroll-area-viewport"]');
  const scrollerBounds = scroller?.getBoundingClientRect();
  const top = Math.max(listBounds.top, scrollerBounds?.top ?? -Infinity);
  const bottom = Math.min(listBounds.bottom, scrollerBounds?.bottom ?? Infinity);
  let key: string | null = null;
  for (const row of list.querySelectorAll<HTMLElement>("[data-pull-request-key]")) {
    const bounds = row.getBoundingClientRect();
    if (bounds.bottom <= top) continue;
    if (bounds.top >= bottom || (key !== null && bounds.top > y)) break;
    key = row.dataset.pullRequestKey ?? null;
  }
  return key;
}
