import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test("An invalid host filter keeps the Issues page open", WEB, async ({ s1, app, browser }) => {
  await s1.project("demo");
  await s1.open("/issues?host=true");

  await app.screenshot("issues-invalid-host");
  await expect(browser.locator("h1")).toHaveText("Issues");
});
