/**
 * The pull request row a close sweep at `y` reaches: the last row starting at or above it, with
 * `y` held inside the part of the list its scroller shows, so a sweep never takes rows offscreen.
 */
export function closeSweepRowKeyAt(list: Element, y: number): string | null {
  const listBounds = list.getBoundingClientRect();
  const scroller = list.parentElement?.closest('[data-slot="scroll-area-viewport"]');
  const scrollerBounds = scroller?.getBoundingClientRect();
  const top = Math.max(listBounds.top, scrollerBounds?.top ?? -Infinity);
  const bottom = Math.min(listBounds.bottom, scrollerBounds?.bottom ?? Infinity);
  const visibleY = Math.min(Math.max(y, top), bottom - 1);
  let key: string | null = null;
  for (const row of list.querySelectorAll<HTMLElement>("[data-pull-request-key]")) {
    if (key !== null && row.getBoundingClientRect().top > visibleY) break;
    key = row.dataset.pullRequestKey ?? null;
  }
  return key;
}
