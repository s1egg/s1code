import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test(
  "Thread search finds a curly apostrophe next to a two-character Chinese word",
  WEB,
  async ({ s1, app, screen }) => {
    const project = await s1.project("demo");
    const thread = await s1.thread({ project, title: "Weekly notes", messages: ["Start"] });
    await s1.open(thread);

    // Search reads what the user wrote; messages the CLI sends count as an agent's.
    const composer = screen.getByRole("textbox");
    await composer.pressSequentially("部署 John’s service after migration");
    await composer.press("Enter");
    await expect(screen.getByText("second fixture turn complete", { exact: false })).toBeVisible();

    await screen.getByRole("combobox", "Search threads").fill("部署 John’s");
    await expect(screen.getByRole("listbox", "Thread search results")).toContainText(
      "John’s service",
    );
    await app.screenshot("search");
  },
);
