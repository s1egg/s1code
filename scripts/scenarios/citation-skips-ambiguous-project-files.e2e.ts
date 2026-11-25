import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

const FILE = "handoff.txt";

test(
  "A bare citation leaves the file unresolved when other projects contain several matches",
  WEB,
  async ({ s1, app, browser, screen }) => {
    const project = await s1.project("planning");
    await s1.project("reports", { "notes/HANDOFF.txt": "Report handoff" });
    await s1.project("support", {
      "current/Handoff.txt": "Current support handoff",
      "archive/HANDOFF.txt": "Archived support handoff",
    });
    const thread = await s1.thread({
      project,
      title: "Find the handoff",
      messages: [`See :codex-file-citation{path="${FILE}" line_range_start="1"}`],
    });

    await s1.open(thread);
    await screen.getByRole("button", /^Agent See/).tap();
    await screen.getByRole("link", /^handoff\.txt/).tap();

    try {
      await expect(
        browser
          .locator("[data-right-panel-surface-content]")
          .getByText("The file could not be accessed or read. It may be missing or inaccessible."),
      ).toBeVisible();
    } finally {
      await app.screenshot("ambiguous-handoff-citation");
    }
  },
);
