import { expect, it } from "vite-plus/test";

import { closeSweepRowKeyAt } from "./closeSweepTarget";

it("holds a sweep past the scroller's edge on the last row the scroller shows", () => {
  const scroller = document.createElement("div");
  scroller.dataset.slot = "scroll-area-viewport";
  scroller.style.cssText = "position: fixed; top: 0; height: 100px; overflow: auto;";
  const list = document.createElement("div");
  for (let index = 0; index < 10; index += 1) {
    const row = document.createElement("div");
    row.dataset.pullRequestKey = `row-${index}`;
    row.style.height = "30px";
    list.append(row);
  }
  scroller.append(list);
  document.body.append(scroller);
  using _cleanup = { [Symbol.dispose]: () => scroller.remove() };

  expect(closeSweepRowKeyAt(list, 1_000)).toBe("row-3");
  expect(closeSweepRowKeyAt(list, -1_000)).toBe("row-0");
  expect(closeSweepRowKeyAt(list, 45)).toBe("row-1");
});
