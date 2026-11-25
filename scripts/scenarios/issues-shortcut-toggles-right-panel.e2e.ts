import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test(
  "The right panel shortcut closes and reopens the Issues panel",
  WEB,
  async ({ s1, app, browser, screen }) => {
    await s1.project("demo");
    await s1.open("/issues?selectedProjectId=demo&tracker=github&scope=example/demo&key=42");

    const toggle = screen.getByRole("button", "Toggle right panel");
    await screen.getByRole("button", { name: "Toggle right panel", pressed: true }).waitFor();

    await browser.keyboard.press("ControlOrMeta+Alt+b");
    await app.screenshot("after-close-shortcut");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await browser.keyboard.press("ControlOrMeta+Alt+b");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  },
);
