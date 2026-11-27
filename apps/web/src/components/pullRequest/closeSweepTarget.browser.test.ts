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

it("reaches only rows the scroller shows when its top falls between two rows", () => {
  const scroller = document.createElement("div");
  scroller.dataset.slot = "scroll-area-viewport";
  scroller.style.cssText = "position: fixed; top: 0; width: 100px; height: 100px; overflow: auto;";
  const list = document.createElement("div");
  for (let index = 0; index < 10; index += 1) {
    const row = document.createElement("div");
    row.dataset.pullRequestKey = `row-${index}`;
    row.style.cssText = "height: 30px; margin-bottom: 10px;";
    list.append(row);
  }
  const trailer = document.createElement("div");
  trailer.style.height = "500px";
  list.append(trailer);
  scroller.append(list);
  document.body.append(scroller);
  using _cleanup = { [Symbol.dispose]: () => scroller.remove() };

  // row-0 ends 5px above the scroller's top; row-1 starts 5px below it.
  scroller.scrollTop = 35;
  expect(closeSweepRowKeyAt(list, -1_000)).toBe("row-1");
  scroller.scrollTop = 500;
  expect(closeSweepRowKeyAt(list, -1_000)).toBeNull();
});
