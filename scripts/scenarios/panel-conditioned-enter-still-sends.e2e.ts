import { expect } from "e2e";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { S1_HOME } from "../e2e.config.ts";
import { runPromise, test, WEB } from "./s1.ts";

// A saved rule that binds Enter to the command palette only while the right panel is closed.
const panelConditionedEnter = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const keybindingsPath = (yield* Path.Path).join(S1_HOME, "userdata/keybindings.json");
  const original = (yield* fs.exists(keybindingsPath))
    ? yield* fs.readFileString(keybindingsPath)
    : null;
  return {
    save: fs.writeFileString(
      keybindingsPath,
      '[{ "key": "enter", "command": "commandPalette.toggle", "when": "!rightPanelOpen" }]\n',
    ),
    restore:
      original === null
        ? fs.remove(keybindingsPath, { force: true })
        : fs.writeFileString(keybindingsPath, original),
  };
});

test(
  "Enter sends from the composer while the right panel is open and a rule binds it when closed",
  WEB,
  async ({ s1, app, screen }) => {
    const keybindings = await runPromise(panelConditionedEnter);
    try {
      await runPromise(keybindings.save);
      const project = await s1.project("demo");
      const thread = await s1.thread({ project, title: "Panel work", messages: ["Start"] });

      // The settings list shows the rule once the server has loaded the saved file.
      await s1.open("/settings/keybindings");
      await screen
        .getByRole("button", "Edit shortcut for Command Palette: Toggle: Enter")
        .waitFor();

      await s1.open(thread);
      await screen.getByRole("button", "Toggle right panel").tap();
      await screen.getByRole("button", { name: "Toggle right panel", pressed: true }).waitFor();

      const composer = screen.getByTestId("composer-editor");
      await composer.tap();
      await composer.pressSequentially("Hello with the panel open");
      await composer.press("Enter");
      await app.screenshot("after-enter");
      await expect(composer).toHaveText("");
      await expect(screen.getByText("Hello with the panel open")).toBeVisible();
    } finally {
      await runPromise(keybindings.restore);
    }
  },
);
