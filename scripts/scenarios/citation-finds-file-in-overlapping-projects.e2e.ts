/// <reference lib="dom" />
import { expect } from "e2e";

import { S1_HOME } from "../e2e.config.ts";
import { makeState, runPromise, test, WEB } from "./s1.ts";

const FILE = "quarterly-handoff.txt";
const CONTENT = "Handoff notes from the shared file";

test(
  "A citation finds one file listed by two overlapping projects",
  WEB,
  async ({ s1, app, browser, screen }) => {
    const repository = await s1.project("reports", { [`docs/${FILE}`]: CONTENT });
    const nested = `${repository}/docs`;
    const project = await s1.project("planning");
    const thread = await s1.thread({
      project,
      title: "Find the report",
      messages: [`See :codex-file-citation{path="${FILE}" line_range_start="1"}`],
    });
    const { cli } = makeState(S1_HOME);
    await runPromise(cli(["project", "add", nested, "--title", "Report docs"]));
    try {
      await s1.open(thread);
      await screen.getByRole("button", /^Agent See/).tap();
      await screen.getByRole("link", /^quarterly-handoff\.txt/).tap();

      try {
        await expect
          .poll(() =>
            browser.evaluate(() => {
              const panel = document.querySelector("[data-right-panel-surface-content]");
              for (const host of panel?.querySelectorAll("*") ?? []) {
                const content = host.shadowRoot?.querySelector("[data-content]");
                if (content) return content.textContent ?? "";
              }
              return panel?.textContent ?? "";
            }),
          )
          .toContain(CONTENT);
      } finally {
        await app.screenshot("citation-in-overlapping-projects");
      }
    } finally {
      await runPromise(cli(["project", "remove", nested]));
    }
  },
);
