import { describe, expect, it } from "vite-plus/test";

import { defaultThemeGeneration, defaultThemeToApply, themeSetsOwnMode } from "./useDefaultTheme";

const BASE = {
  environmentId: "env-1",
  defaultTheme: "nightfall",
  defaultThemeSetAt: "2026-08-28T00:00:00.000Z",
  appliedGeneration: null,
  resolves: true,
} as const;

describe("default theme adoption", () => {
  it("does not replay a generation it already applied", () => {
    const generation = defaultThemeGeneration(BASE.defaultTheme, BASE.defaultThemeSetAt);
    expect(defaultThemeToApply({ ...BASE, appliedGeneration: generation })).toBe(null);
  });

  it("applies the same theme again when the environment re-sets it", () => {
    const applied = defaultThemeGeneration(BASE.defaultTheme, "2026-08-28T00:00:00.000Z");
    const next = defaultThemeToApply({
      ...BASE,
      defaultThemeSetAt: "2026-08-29T00:00:00.000Z",
      appliedGeneration: applied,
    });
    expect(next).not.toBe(null);
    expect(next).not.toBe(applied);
  });

  it("keeps a later local choice after a previously adopted retired theme turns stock", () => {
    // Adopted `iris` at this set time, then picked Graphite locally; iris now decodes as stock.
    const applied = defaultThemeGeneration("iris", BASE.defaultThemeSetAt);
    expect(defaultThemeToApply({ ...BASE, defaultTheme: "", appliedGeneration: applied })).toBe(
      null,
    );
    expect(
      defaultThemeToApply({
        ...BASE,
        defaultTheme: "",
        defaultThemeSetAt: "2026-08-29T00:00:00.000Z",
        appliedGeneration: applied,
      }),
    ).not.toBe(null);
    expect(
      defaultThemeToApply({
        ...BASE,
        defaultTheme: "",
        appliedGeneration: "nightfall@" + BASE.defaultThemeSetAt,
      }),
    ).not.toBe(null);
  });

  it("applies the stock theme only when the environment set it", () => {
    expect(defaultThemeToApply({ ...BASE, defaultTheme: "", defaultThemeSetAt: "" })).toBe(null);
    expect(defaultThemeToApply({ ...BASE, defaultTheme: "" })).not.toBe(null);
  });
});

it("lets a theme set its own mode only when no mode was set with it or after it", () => {
  const theme = "2026-11-13T10:00:00.000Z";
  const set = (defaultAppearance: string, defaultAppearanceSetAt: string) =>
    themeSetsOwnMode({ defaultThemeSetAt: theme, defaultAppearance, defaultAppearanceSetAt });
  expect(set("", "")).toBe(true);
  expect(set("dark", "2026-11-13T09:00:00.000Z")).toBe(true);
  expect(set("dark", theme)).toBe(false);
  expect(set("light", "2026-11-13T11:00:00.000Z")).toBe(false);
});
