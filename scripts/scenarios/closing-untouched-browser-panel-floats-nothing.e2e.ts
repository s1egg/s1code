import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test(
  "Closing the right panel on a Browser tab that never navigated floats nothing",
  WEB,
  async ({ s1, app, browser, screen }) => {
    const project = await s1.project("demo");
    const thread = await s1.thread({ project, title: "Untouched browser", messages: ["first"] });
    await s1.open(thread);

    await screen.getByRole("button", "Toggle right panel").tap();
    await screen.getByRole("button", "Browser B").tap();
    await screen.getByRole("textbox", "Search or enter URL").waitFor();
    await app.screenshot("browser-untouched-before-close");

    await screen.getByRole("button", "Toggle right panel").tap();
    await app.screenshot("after-close-untouched-browser");
    await expect(browser.locator('section[aria-label="Floating browser preview"]')).toBeHidden();
  },
);
