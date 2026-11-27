import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { SidebarProvider } from "../ui/sidebar";
import { SidebarRailUtilities } from "./SidebarChrome";

it("keeps only Settings at the foot of the project rail", async () => {
  await using screen = await render(
    <SidebarProvider>
      <SidebarRailUtilities />
    </SidebarProvider>,
  );
  const settings = page.getByRole("button", { name: "Settings" });
  await expect.element(settings).toBeVisible();
  expect(screen.container.querySelectorAll("button")).toHaveLength(1);

  await userEvent.click(settings);
  expect(screen.router?.state.location.pathname).toBe("/settings");
});
