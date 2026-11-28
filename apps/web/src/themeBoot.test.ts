import {
  BUILT_IN_THEMES,
  S1_CODE_DARK_THEME_COLORS,
  S1_CODE_LIGHT_THEME_COLORS,
} from "@s1tools/shared/themePalettes";
import { describe, expect, it, vi } from "vite-plus/test";

import indexHtml from "../index.html?raw";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  ENVIRONMENT_THEMES_STORAGE_KEY,
  getStandardThemeColors,
  getThemeColorsForMode,
  invalidateCustomThemes,
  isKnownThemePreference,
  publishedThemeDefinitions,
  resolveThemeAppearance,
  THEME_APPEARANCE_MODE_STORAGE_KEY,
  THEME_FOLLOW_SYSTEM_STORAGE_KEY,
  toCanonicalThemeColor,
} from "./themePalette";

const THEME_STORAGE_KEY = "s1code:theme";
const BUILT_IN_THEME = (id: string) => BUILT_IN_THEMES.find((theme) => theme.id === id)!;

const bootScript = (() => {
  const match = indexHtml.match(/<script>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error("Could not find the inline boot script in index.html");
  return match[1];
})();

type BootResult = {
  isDark: boolean;
  themeId: string | undefined;
  themeSelected: string | undefined;
  backgroundColor: string;
  bootVariables: Record<string, string>;
  metaContent: string | null;
};

function runBootScript(options: {
  storage?: Record<string, string>;
  storageThrows?: boolean;
  prefersDark: boolean;
}): BootResult {
  const classes = new Set<string>();
  const bootVariables: Record<string, string> = {};
  const meta = {
    content: null as string | null,
    setAttribute(_name: string, value: string) {
      this.content = value;
    },
  };
  const documentElement = {
    dataset: {} as Record<string, string | undefined>,
    classList: {
      add: (name: string) => void classes.add(name),
      remove: (name: string) => void classes.delete(name),
      toggle: (name: string, force?: boolean) => {
        const next = force ?? !classes.has(name);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
    },
    style: {
      backgroundColor: "",
      setProperty: (name: string, value: string) => {
        bootVariables[name] = value;
      },
    },
  };
  const fakeDocument = {
    documentElement,
    querySelectorAll: (selector: string) => (selector === 'meta[name="theme-color"]' ? [meta] : []),
  };
  const fakeWindow = {
    localStorage: {
      getItem: (key: string): string | null => {
        if (options.storageThrows) throw new Error("storage blocked");
        return options.storage?.[key] ?? null;
      },
    },
    matchMedia: () => ({ matches: options.prefersDark }),
  };

  const fakeCss = {
    supports: (property: string, value: string) =>
      property === "color" && toCanonicalThemeColor(value) !== null,
  };

  new Function("window", "document", "CSS", bootScript)(fakeWindow, fakeDocument, fakeCss);

  return {
    isDark: classes.has("dark"),
    themeId: documentElement.dataset.themeId,
    themeSelected: documentElement.dataset.themeSelected,
    backgroundColor: documentElement.style.backgroundColor,
    bootVariables,
    metaContent: meta.content,
  };
}

function runtimeResolvedAppearance(
  storage: Record<string, string>,
  prefersDark: boolean,
): "light" | "dark" {
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => storage[key] ?? null },
    matchMedia: () => ({ matches: prefersDark }),
  });
  invalidateCustomThemes();
  try {
    const raw = storage[THEME_STORAGE_KEY] ?? null;
    const theme = raw !== null && isKnownThemePreference(raw) ? raw : "system";
    const followRaw = storage[THEME_FOLLOW_SYSTEM_STORAGE_KEY] ?? null;
    const appearanceRaw = storage[THEME_APPEARANCE_MODE_STORAGE_KEY] ?? null;
    const appearanceMode =
      appearanceRaw === "light" || appearanceRaw === "dark" || appearanceRaw === "system"
        ? appearanceRaw
        : followRaw === "true"
          ? "system"
          : followRaw === "false"
            ? null
            : theme === "system"
              ? "system"
              : null;
    const followSystem = appearanceMode === "system";
    return resolveThemeAppearance(theme, prefersDark, followSystem, appearanceMode ?? undefined);
  } finally {
    vi.unstubAllGlobals();
    invalidateCustomThemes();
  }
}

const AURORA_DUAL = {
  id: "aurora",
  label: "Aurora",
  appearance: "light",
  colors: { canvas: "#f8fbff", text: "#10243d", accent: "#5b6cff" },
  variants: { dark: { canvas: "#101827", text: "#eef5ff", accent: "#7c93ff" } },
};
const CHARCOAL_DARK_ONLY = {
  id: "charcoal",
  label: "Charcoal",
  appearance: "dark",
  colors: { canvas: "#1c1210", text: "#ffe8d9", accent: "#ff7a45" },
};

describe("index.html boot script", () => {
  const parityCases: ReadonlyArray<{
    name: string;
    storage: Record<string, string>;
    prefersDark: boolean;
  }> = [
    { name: "no stored preference on a dark OS", storage: {}, prefersDark: true },
    ...["s1-chat", "grove", "ocean", "ember", "iris", "s1-grove", "s1-chat-dark"].map((id) => ({
      name: `a retired ${id} preference falls back to system`,
      storage: { [THEME_STORAGE_KEY]: id, [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "true" },
      prefersDark: true,
    })),
    {
      name: "Midnight follows a light OS to its Mist half",
      storage: { [THEME_STORAGE_KEY]: "s1-midnight", [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "true" },
      prefersDark: false,
    },
    {
      name: "Midnight without a stored mode keeps its dark base on a light OS",
      storage: { [THEME_STORAGE_KEY]: "s1-midnight" },
      prefersDark: false,
    },
    {
      name: "Midnight with follow-system off keeps its dark base on a light OS",
      storage: { [THEME_STORAGE_KEY]: "s1-midnight", [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "false" },
      prefersDark: false,
    },
    {
      name: "a dual-mode custom theme follows the OS",
      storage: {
        [THEME_STORAGE_KEY]: "aurora",
        [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "true",
        [CUSTOM_THEMES_STORAGE_KEY]: JSON.stringify([AURORA_DUAL]),
      },
      prefersDark: true,
    },
    {
      name: "a dark-only custom theme stays dark on a light OS",
      storage: {
        [THEME_STORAGE_KEY]: "charcoal",
        [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "true",
        [CUSTOM_THEMES_STORAGE_KEY]: JSON.stringify([CHARCOAL_DARK_ONLY]),
      },
      prefersDark: false,
    },
    {
      name: "a legacy mode-suffixed preference is treated as unknown",
      storage: {
        [THEME_STORAGE_KEY]: "aurora:dark",
        [CUSTOM_THEMES_STORAGE_KEY]: JSON.stringify([AURORA_DUAL]),
      },
      prefersDark: true,
    },
    {
      name: "a removed custom theme falls back to system",
      storage: { [THEME_STORAGE_KEY]: "gone-theme" },
      prefersDark: true,
    },
    {
      name: "a corrupted follow-system value falls back to inference",
      storage: { [THEME_STORAGE_KEY]: "system", [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "1" },
      prefersDark: true,
    },
    {
      name: "follow-system off keeps an explicit light preference on a dark OS",
      storage: { [THEME_STORAGE_KEY]: "light", [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "false" },
      prefersDark: true,
    },
    {
      name: "a bare dark preference stays dark on a light OS",
      storage: { [THEME_STORAGE_KEY]: "dark" },
      prefersDark: false,
    },
    {
      name: "follow-system off keeps a bare dark preference on a light OS",
      storage: { [THEME_STORAGE_KEY]: "dark", [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "false" },
      prefersDark: false,
    },
  ];

  it.each(parityCases)("matches the runtime appearance: $name", ({ storage, prefersDark }) => {
    const boot = runBootScript({ storage, prefersDark });
    expect(boot.isDark).toBe(runtimeResolvedAppearance(storage, prefersDark) === "dark");
  });

  it("accepts exponent-form OKLCH before the runtime mounts", () => {
    const colors = {
      canvas: "oklch(9.5e-1 1e-2 2.8e2)",
      chrome: "oklch(9.4e-1 1e-2 2.8e2)",
      text: "oklch(2e-1 0 0 / 9e-1)",
      accent: "oklch(6.2e-1 0.2 2.8e2)",
    };
    const boot = runBootScript({
      storage: {
        [THEME_STORAGE_KEY]: "scientific",
        [CUSTOM_THEMES_STORAGE_KEY]: JSON.stringify([
          {
            id: "scientific",
            label: "Scientific",
            appearance: "light",
            colors,
          },
        ]),
      },
      prefersDark: false,
    });

    expect(boot.bootVariables["--boot-background"]).toBe(colors.canvas);
    expect(boot.bootVariables["--boot-foreground"]).toBe(colors.text);
    expect(boot.bootVariables["--boot-accent"]).toBe(colors.accent);
    expect(boot.backgroundColor).toBe(colors.chrome);
    expect(boot.metaContent).toBe(colors.chrome);
  });

  it("paints a published theme from its stored copy before the server connects", () => {
    const [published] = publishedThemeDefinitions([
      {
        id: "nightfall",
        name: "Nightfall",
        appearance: "dark",
        canvas: "#1a1b26",
        accent: "#7aa2f7",
      },
    ]);
    if (!published) throw new Error("expected the published theme");
    const boot = runBootScript({
      storage: {
        [THEME_STORAGE_KEY]: "nightfall",
        [ENVIRONMENT_THEMES_STORAGE_KEY]: JSON.stringify([published]),
      },
      prefersDark: true,
    });

    expect(boot.themeId).toBe("nightfall");
    expect(boot.bootVariables["--boot-background"]).toBe(published.colors.canvas);
    expect(boot.backgroundColor).toBe(published.colors.chrome);
  });

  it("paints retired built-in preferences as the unthemed default", () => {
    for (const id of ["s1-chat", "grove", "ocean", "ember", "iris", "s1-chat-dark"]) {
      for (const prefersDark of [false, true]) {
        const boot = runBootScript({ storage: { [THEME_STORAGE_KEY]: id }, prefersDark });
        const colors = prefersDark ? S1_CODE_DARK_THEME_COLORS : S1_CODE_LIGHT_THEME_COLORS;
        expect(boot.themeId).toBeUndefined();
        expect(boot.themeSelected).toBeUndefined();
        expect(boot.isDark).toBe(prefersDark);
        expect(boot.backgroundColor).toBe(colors.chrome);
        expect(boot.metaContent).toBe(colors.chrome);
      }
    }
  });

  it("ignores a stored custom theme that claims a retired built-in id", () => {
    const boot = runBootScript({
      storage: {
        [THEME_STORAGE_KEY]: "grove",
        [CUSTOM_THEMES_STORAGE_KEY]: JSON.stringify([{ ...AURORA_DUAL, id: "grove" }]),
      },
      prefersDark: false,
    });
    expect(boot.themeId).toBeUndefined();
  });

  it("keeps a stored dark S1 pick dark and lets follow-system switch it to its light half", () => {
    const stored = { [THEME_STORAGE_KEY]: "s1-midnight" };
    expect(runBootScript({ storage: stored, prefersDark: false }).isDark).toBe(true);
    const following = { ...stored, [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "true" };
    expect(runBootScript({ storage: following, prefersDark: false }).isDark).toBe(false);
    expect(runBootScript({ storage: following, prefersDark: true }).isDark).toBe(true);
  });

  it("keeps every built-in boot splash in sync with the real palettes", () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(theme.appearance).toBe("dark");
      for (const mode of ["light", "dark"] as const) {
        const colors = getThemeColorsForMode(theme, mode);
        expect(colors).not.toBeNull();
        const boot = runBootScript({
          storage: {
            [THEME_STORAGE_KEY]: theme.id,
            [THEME_APPEARANCE_MODE_STORAGE_KEY]: mode,
          },
          prefersDark: mode === "dark",
        });
        expect(boot.themeId).toBe(theme.id);
        expect(boot.isDark).toBe(mode === "dark");
        expect(boot.bootVariables["--boot-background"]).toBe(colors!.canvas);
        expect(boot.bootVariables["--boot-foreground"]).toBe(colors!.text);
        expect(boot.bootVariables["--boot-accent"]).toBe(colors!.accent);
        expect(boot.backgroundColor).toBe(colors!.chrome);
        expect(boot.metaContent).toBe(colors!.chrome);
      }
    }
  });

  it("applies the matching half of an automatic mix to the splash", () => {
    const [charcoal, graphite] = [BUILT_IN_THEME("s1-charcoal"), BUILT_IN_THEME("s1-graphite")];
    const storage = {
      [THEME_STORAGE_KEY]: charcoal.id,
      [THEME_APPEARANCE_MODE_STORAGE_KEY]: "system",
      "s1code:theme-halves:v1": JSON.stringify({ dark: graphite.id }),
    };

    const dark = runBootScript({ storage, prefersDark: true });
    expect(dark.isDark).toBe(true);
    expect(dark.themeId).toBe(graphite.id);
    expect(dark.bootVariables["--boot-background"]).toBe(
      getThemeColorsForMode(graphite, "dark")!.canvas,
    );

    const light = runBootScript({ storage, prefersDark: false });
    expect(light.isDark).toBe(false);
    expect(light.themeId).toBe(charcoal.id);
    expect(light.bootVariables["--boot-background"]).toBe(
      getThemeColorsForMode(charcoal, "light")!.canvas,
    );
  });

  it("paints the half's splash when the base theme no longer exists", () => {
    const boot = runBootScript({
      storage: {
        [THEME_STORAGE_KEY]: "gone-theme",
        [THEME_APPEARANCE_MODE_STORAGE_KEY]: "system",
        "s1code:theme-halves:v1": JSON.stringify({ dark: "s1-graphite" }),
      },
      prefersDark: true,
    });
    expect(boot.isDark).toBe(true);
    expect(boot.themeId).toBe("s1-graphite");
    expect(boot.themeSelected).toBe("true");
    expect(boot.bootVariables["--boot-background"]).toBe(
      getThemeColorsForMode(BUILT_IN_THEME("s1-graphite"), "dark")!.canvas,
    );
  });

  it.each(["light", "dark"] as const)(
    "uses runtime defaults for malformed custom roles in %s",
    (appearance) => {
      const boot = runBootScript({
        storage: {
          [THEME_STORAGE_KEY]: "partial",
          [THEME_FOLLOW_SYSTEM_STORAGE_KEY]: "true",
          [CUSTOM_THEMES_STORAGE_KEY]: JSON.stringify([
            {
              id: "partial",
              label: "Partial",
              appearance,
              colors: { canvas: "not-a-color", text: "#fffaff", accent: "nope" },
            },
          ]),
        },
        prefersDark: appearance === "dark",
      });

      const defaults = getStandardThemeColors(appearance);
      expect(boot.themeId).toBe("partial");
      expect(boot.bootVariables["--boot-background"]).toBe(defaults.canvas);
      expect(boot.bootVariables["--boot-foreground"]).toBe("#fffaff");
      expect(boot.bootVariables["--boot-accent"]).toBe(defaults.accent);
      expect(boot.backgroundColor).toBe(defaults.chrome);
      expect(boot.metaContent).toBe(defaults.chrome);
    },
  );

  it("follows the OS appearance when storage is unavailable", () => {
    const light = runBootScript({ storageThrows: true, prefersDark: false });
    expect(light.isDark).toBe(false);
    expect(light.themeId).toBeUndefined();

    const dark = runBootScript({ storageThrows: true, prefersDark: true });
    expect(dark.isDark).toBe(true);
  });
});
