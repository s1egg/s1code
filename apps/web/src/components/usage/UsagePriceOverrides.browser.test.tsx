import type { EnvironmentId } from "@s1tools/contracts";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";

const ENVIRONMENT_ID = vi.hoisted(() => "workstation");
const OTHER_ENVIRONMENT_ID = vi.hoisted(() => "laptop");
const writes = vi.hoisted(() => [] as Array<{ environmentId: string }>);

vi.mock(import("~/state/presentation"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  const actual = await original();
  const presentation = (label: string) => ({
    entry: { target: { label } },
    connection: { phase: "connected" },
    serverConfig: {
      environment: { capabilities: { usagePriceOverrides: true, usageModelAliases: true } },
    },
  });
  return {
    ...actual,
    environmentPresentations: {
      ...actual.environmentPresentations,
      presentationsAtom: Atom.make(
        new Map([
          [ENVIRONMENT_ID, presentation("workstation")],
          [OTHER_ENVIRONMENT_ID, presentation("laptop")],
        ]),
      ) as never,
    },
  };
});
vi.mock(import("~/state/server"), async (original) => {
  const { Atom } = await import("effect/reactivity");
  const actual = await original();
  const settings = Atom.make({
    usagePriceOverrides: {
      "priced-model": { inputCostPerMillionTokens: 1, outputCostPerMillionTokens: 4 },
    },
    usageModelAliases: { "my-preview": "gpt-4o" },
  });
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      settingsValueAtom: (() => settings) as never,
    },
  };
});
vi.mock(import("~/state/session"), async (original) => {
  const { AsyncResult, Atom } = await import("effect/reactivity");
  const actual = await original();
  const session = Atom.make(
    AsyncResult.success({ authenticated: true, scopes: ["settings:write"] }),
  );
  return {
    ...actual,
    environmentSession: {
      ...actual.environmentSession,
      sessionStateAtom: (() => session) as never,
    },
    readEnvironmentScope: (() => true) as never,
  };
});
vi.mock(import("~/state/use-atom-command"), async (original) => {
  const { AsyncResult } = await import("effect/reactivity");
  const { serverEnvironment } = await import("~/state/server");
  const write = async (input: { environmentId: string }) => {
    writes.push(input);
    return AsyncResult.success(undefined);
  };
  return {
    ...(await original()),
    useAtomCommand: ((command: unknown) =>
      command === serverEnvironment.updateSettings
        ? write
        : async () => AsyncResult.success(undefined)) as never,
  };
});

import { UsageDrillIn } from "./UsageDrillIn";
import { UsagePriceOverrides, UsagePricesDrillIn } from "./UsagePriceOverrides";

/** Usage and its Model prices drill-in, sharing the environment filter as the thread sidebar does. */
function UsageWithPrices() {
  const [environmentIds, setEnvironmentIds] = useState<ReadonlySet<EnvironmentId> | null>(null);
  const [prices, setPrices] = useState(false);
  return prices ? (
    <>
      <button type="button" onClick={() => setPrices(false)}>
        Back
      </button>
      <UsagePricesDrillIn selectedEnvironmentIds={environmentIds} />
    </>
  ) : (
    <UsageDrillIn
      onOpenPrices={() => setPrices(true)}
      selectedEnvironmentIds={environmentIds}
      onSelectedEnvironmentIdsChange={setEnvironmentIds}
    />
  );
}

const renderPrices = (initialModel?: string) =>
  render(<UsagePriceOverrides usage={[]} initialModel={initialModel} />);

describe("UsagePriceOverrides", () => {
  it("waits for a price before flagging an unpriced model's new row", async () => {
    await using _screen = await renderPrices("glm-5.3");
    const modelId = page.getByLabelText("New model ID");
    await expect.element(modelId).toHaveValue("glm-5.3");

    expect(page.getByRole("alert").elements()).toEqual([]);
    await expect.element(modelId).not.toHaveAttribute("aria-invalid");
    await expect.element(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await userEvent.type(page.getByLabelText("Input price for glm-5.3"), "2");
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Output is required on laptop.");
    await expect.element(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("saves prices only to the environment Usage is filtered to, and Back keeps the filter", async () => {
    writes.length = 0;
    await using _screen = await render(<UsageWithPrices />);
    await page.getByRole("button", { name: "Usage environments: All environments" }).click();
    await page.getByRole("menuitemcheckbox", { name: "laptop" }).click();
    await userEvent.keyboard("{Escape}");
    await expect
      .element(page.getByRole("button", { name: "Usage environments: workstation" }))
      .toBeInTheDocument();

    await page.getByRole("button", { name: "Model prices" }).click();
    await expect
      .element(page.getByRole("button", { name: "Apply to workstation" }))
      .toBeInTheDocument();
    const input = page.getByLabelText("Input price for priced-model");
    await userEvent.clear(input);
    await userEvent.type(input, "2");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => writes.map((write) => write.environmentId)).toEqual([ENVIRONMENT_ID]);

    await page.getByRole("button", { name: "Back" }).click();
    await expect
      .element(page.getByRole("button", { name: "Usage environments: workstation" }))
      .toBeInTheDocument();
  });

  it("asks for a model ID once a new row maps to a model", async () => {
    await using _screen = await renderPrices();
    await page.getByRole("button", { name: "Add model price" }).click();
    const modelId = page.getByLabelText("New model ID");
    await expect.element(modelId).toHaveValue("");

    expect(page.getByRole("alert").elements()).toEqual([]);
    await expect.element(modelId).not.toHaveAttribute("aria-invalid");

    await userEvent.type(page.getByLabelText("Map new model to model"), "gpt-4o");
    await expect.element(page.getByRole("alert")).toHaveTextContent("Enter a model ID.");
    await expect.element(modelId).toHaveAttribute("aria-invalid", "true");
    await expect.element(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("leaves no pending change when a mapping goes back to its saved model", async () => {
    await using _screen = await renderPrices();
    const mapTo = page.getByLabelText("Map my-preview to model");
    await userEvent.clear(mapTo);
    await userEvent.type(page.getByLabelText("Input price for my-preview"), "2");
    await userEvent.type(mapTo, "gpt-4o");

    await expect
      .element(page.getByRole("button", { name: "Discard changes" }))
      .not.toBeInTheDocument();
    expect(page.getByRole("alert").elements()).toEqual([]);
    await expect
      .element(page.getByRole("button", { name: "Apply to All environments" }))
      .toBeEnabled();
  });

  it("keeps typed prices when a priced model's new mapping is cleared", async () => {
    await using _screen = await renderPrices();
    const input = page.getByLabelText("Input price for priced-model");
    await userEvent.clear(input);
    await userEvent.type(input, "2");
    const mapTo = page.getByLabelText("Map priced-model to model");
    await userEvent.type(mapTo, "gpt-4o");
    await userEvent.clear(mapTo);

    await expect.element(input).toHaveValue("2");
    await expect.element(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});
