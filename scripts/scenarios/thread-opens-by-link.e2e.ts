import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test(
  "A seeded thread opens by its link and shows its history",
  WEB,
  async ({ s1, app, screen }) => {
    const project = await s1.project("demo");
    const thread = await s1.thread({
      project,
      title: "Earlier work",
      messages: ["first", "second"],
    });
    await s1.open(thread);

    await expect(screen.getByText("second fixture turn complete", { exact: false })).toBeVisible();
    await app.screenshot("thread");
  },
);
