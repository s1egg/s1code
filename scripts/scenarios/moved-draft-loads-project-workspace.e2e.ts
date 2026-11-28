import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test(
  "A moved draft loads the workspace default of a project it has never opened",
  WEB,
  async ({ s1, app, browser, screen }) => {
    await s1.project("checkout-project", {
      "s1.json": JSON.stringify({ defaultThreadEnvMode: "local" }),
    });
    await s1.open();
    const picker = browser.locator("[data-draft-project-trigger]");
    const workspace = browser.locator('[data-composer-shortcut="composer.workspace"]');
    await picker.filter({ hasText: "checkout-project" }).waitFor();
    await screen.getByRole("textbox").fill("Plan the implementation");

    await s1.project("worktree-project", {
      "s1.json": JSON.stringify({ defaultThreadEnvMode: "worktree" }),
    });
    await picker.tap();
    await screen.getByRole("option", "worktree-project", { exact: true }).tap();
    await picker.filter({ hasText: "worktree-project" }).waitFor();
    await app.screenshot("workspace-after-moving-draft");
    await expect(workspace).toContainText("New worktree");
  },
);
