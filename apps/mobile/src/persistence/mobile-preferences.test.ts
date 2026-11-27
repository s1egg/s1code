import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { vi } from "vite-plus/test";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-sqlite", () => ({ openDatabaseAsync: vi.fn() }));

import { resolveMobileThemeIds } from "../lib/mobileTheme";
import * as MobileDatabase from "./mobile-database";
import * as MobilePreferences from "./mobile-preferences";
import * as MobileSecureStorage from "./mobile-secure-storage";

function storeWithSavedJson(payload: string) {
  const database = {
    loadPreferencesJson: Effect.succeedSome({ payload, updatedAt: 1 }),
    savePreferencesJson: () => Effect.void,
  } as unknown as MobileDatabase.MobileDatabase["Service"];
  const secureStorage = MobileSecureStorage.MobileSecureStorage.of({
    getItem: () => Effect.succeed(null),
    setItem: () => Effect.void,
    removeItem: () => Effect.void,
  });
  return MobilePreferences.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(MobileDatabase.MobileDatabase, database),
        Layer.succeed(MobileSecureStorage.MobileSecureStorage, secureStorage),
      ),
    ),
  );
}

const loadSaved = (saved: Record<string, unknown>) =>
  MobilePreferences.MobilePreferencesStore.use((store) => store.load).pipe(
    Effect.provide(storeWithSavedJson(JSON.stringify(saved))),
  );

describe("mobile theme preferences", () => {
  it.effect("reads a retired dark theme as the stock theme instead of the light pair", () =>
    Effect.gen(function* () {
      const preferences = yield* loadSaved({
        themeId: "s1-graphite",
        lightThemeId: "s1-graphite",
        darkThemeId: "iris",
      });
      expect(preferences.darkThemeId).toBe("s1-code");
      expect(resolveMobileThemeIds(preferences)).toEqual({
        light: "s1-graphite",
        dark: "s1-code",
      });
    }),
  );

  it.effect("keeps the legacy theme for a half that was never saved", () =>
    Effect.gen(function* () {
      const preferences = yield* loadSaved({ themeId: "s1-graphite", darkThemeId: "unknown" });
      expect(resolveMobileThemeIds(preferences)).toEqual({
        light: "s1-graphite",
        dark: "s1-graphite",
      });
    }),
  );
});
