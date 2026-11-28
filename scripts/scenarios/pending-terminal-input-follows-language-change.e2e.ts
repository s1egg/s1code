import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test(
  "Language changes update the same terminal input during and after setup",
  WEB,
  async ({ s1, app, browser, screen }) => {
    const project = await s1.project("demo");
    const thread = await s1.thread({ project, title: "Terminal work", messages: ["Start"] });
    await s1.open(thread);

    await browser.evaluate(() => {
      const load = FontFace.prototype.load;
      const ready = new Promise<void>((resolve) => {
        window.addEventListener("release-terminal-font", () => resolve(), { once: true });
      });
      FontFace.prototype.load = function () {
        return this.family.includes("Symbols Nerd Font Mono")
          ? ready.then(() => load.call(this))
          : load.call(this);
      };
      return null;
    });

    await screen.getByRole("button", "Toggle terminal drawer").tap();
    const input = browser.locator(".s1-ghostty-input:not([data-workspace-focus-default])");
    await expect(input).toHaveAttribute("aria-label", "Terminal input");
    await browser.evaluate(() => {
      document.querySelector(".s1-ghostty-input")!.setAttribute("data-original-terminal", "");
      return null;
    });

    await screen.getByRole("button", "Settings", { exact: true }).tap();
    await screen.getByLabel("Language", { exact: true }).tap();
    await screen.getByText("日本語", { exact: true }).tap();
    await screen.getByLabel("言語", { exact: true }).waitFor();

    const originalInput = browser.locator(
      ".s1-ghostty-input[data-original-terminal]:not([data-workspace-focus-default])",
    );
    await app.screenshot("pending-terminal-input-after-language-change");
    await expect(originalInput).toHaveAttribute("aria-label", "ターミナルの入力");
    await browser.evaluate(() => window.dispatchEvent(new Event("release-terminal-font")));

    const readyInput = browser.locator(
      ".s1-ghostty-input[data-original-terminal][data-workspace-focus-default]",
    );
    await expect(readyInput).toHaveAttribute("aria-label", "ターミナルの入力");
    await screen.getByLabel("言語", { exact: true }).tap();
    await screen.getByText("English", { exact: true }).tap();
    await screen.getByLabel("Language", { exact: true }).waitFor();
    await browser.keyboard.press("Escape");

    await expect(readyInput).toHaveAttribute("aria-label", "Terminal input");
  },
);
