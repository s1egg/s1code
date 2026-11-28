import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { ComposerAddMenu } from "./ComposerAddMenu";

it("opens the Files and Folder menu with a mouse click and picks a folder", async () => {
  const onOpenPicker = vi.fn();
  const onPickFolder = vi.fn();
  await using _screen = await render(
    <ComposerAddMenu
      hidden={false}
      onAttach={onOpenPicker}
      onFolder={onPickFolder}
      onSlash={null}
      onPlugins={null}
      onConnectors={vi.fn()}
    />,
  );

  await userEvent.click(page.getByRole("button", { name: "Add to message" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Add folder" }));

  expect(onPickFolder).toHaveBeenCalledOnce();
  expect(onOpenPicker).not.toHaveBeenCalled();
});
