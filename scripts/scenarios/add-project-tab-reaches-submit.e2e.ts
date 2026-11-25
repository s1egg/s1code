import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test(
  "Tab moves from the add-project Git URL field to its submit button",
  WEB,
  async ({ s1, app, screen, browser }) => {
    await s1.project("demo");
    await s1.open();

    await screen.getByRole("combobox", "Projects").tap();
    await screen.getByRole("option", "Add project").tap();
    await screen.getByText("Git URL").tap();
    await screen.getByRole("combobox").fill("https://github.com/s1egg/s1code.git");
    const submit = screen.getByRole("button", "Continue (Enter)");
    await expect(submit).toBeEnabled();

    await browser.keyboard.press("Tab");
    await app.screenshot("after-tab");
    await expect(submit).toBeFocused();
  },
);
