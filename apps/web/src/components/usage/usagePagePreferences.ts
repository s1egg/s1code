import { UsageProviderKind } from "@s1tools/contracts";
import { makeWindow } from "@s1tools/shared/usageFormat";
import * as Schema from "effect/Schema";

import { getLocalStorageItem, setLocalStorageItem } from "../../hooks/useLocalStorage";

const STORAGE_KEY = "s1code:usage-page-preferences:v1";
const UsagePagePreferencesSchema = Schema.Struct({
  metric: Schema.Literals(["cost", "tokens", "limits"]),
  windowDays: Schema.Literals([1, 7, 30, 90]),
  hiddenProviders: Schema.optional(Schema.Array(UsageProviderKind)),
});
export type UsagePagePreferences = typeof UsagePagePreferencesSchema.Type;

const DEFAULT_PREFERENCES: UsagePagePreferences = { metric: "limits", windowDays: 30 };

export function readUsagePagePreferences(): UsagePagePreferences {
  try {
    return getLocalStorageItem(STORAGE_KEY, UsagePagePreferencesSchema) ?? DEFAULT_PREFERENCES;
  } catch (error) {
    console.error("Could not read Usage page preferences.", error);
    return DEFAULT_PREFERENCES;
  }
}

export function saveUsagePagePreferences(preferences: UsagePagePreferences): void {
  try {
    setLocalStorageItem(STORAGE_KEY, preferences, UsagePagePreferencesSchema);
  } catch (error) {
    console.error("Could not save Usage page preferences.", error);
  }
}

/** The window a period reads: the past 24 hours by the hour, longer periods by the day. */
export function usageWindowFor(days: UsagePagePreferences["windowDays"]) {
  return makeWindow(days, undefined, days === 1 ? "hour" : "day");
}
