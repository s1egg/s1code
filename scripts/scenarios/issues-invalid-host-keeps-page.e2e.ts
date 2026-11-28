import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test(
  "An invalid host filter still opens the Issues list in the thread sidebar",
  WEB,
  async ({ s1, app, screen }) => {
    await s1.project("demo");
    await s1.open("/issues?host=true");

    // The old page address redirects to a thread with the Issues drill-in open.
    await expect(screen.getByRole("heading", "Issues")).toBeVisible();
    await expect(screen.getByRole("searchbox", "Search issues")).toBeVisible();
    await app.screenshot("issues-invalid-host");
  },
);
