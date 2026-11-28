import { describe, expect, it } from "vite-plus/test";

import {
  resolveThreadDetailsVisibility,
  setThreadDetailsItem,
  THREAD_DETAILS_ITEMS,
} from "./threadDetailsItems";

const usage = THREAD_DETAILS_ITEMS.find((item) => item.id === "usage")!;
const servers = THREAD_DETAILS_ITEMS.find((item) => item.id === "servers")!;

describe("thread details items", () => {
  it("shows every item by default and keeps unknown overrides out of the result", () => {
    const visibility = resolveThreadDetailsVisibility({
      threadDetailsItems: { usage: false, retired: false },
    });
    expect(visibility.usage).toBe(false);
    expect(visibility.context).toBe(true);
    expect(visibility.servers).toBe(true);
    expect("retired" in visibility).toBe(false);
  });

  it("stores only choices that differ from the default", () => {
    const defaults = { threadDetailsItems: {} };
    expect(setThreadDetailsItem(defaults, usage, false)).toEqual({ usage: false });
    expect(setThreadDetailsItem(defaults, usage, true)).toEqual({});

    const hidden = { threadDetailsItems: { servers: false } };
    expect(setThreadDetailsItem(hidden, servers, true)).toEqual({});
  });
});
