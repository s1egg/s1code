import { msg } from "gt-react";
import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@s1tools/contracts";
import type { UsageChartMetric } from "./UsageProviderChart";
import { resolveShortcutCommand, type ShortcutEventLike } from "../../keybindings";

export type UsageMetric = UsageChartMetric | "limits";
export const METRIC_OPTIONS = [
  { value: "cost", label: msg("Cost"), command: "usage.cost" },
  { value: "tokens", label: msg("Tokens"), command: "usage.tokens" },
  { value: "limits", label: msg("Limits"), command: "usage.limits" },
] as const satisfies readonly { value: UsageMetric; label: string; command: KeybindingCommand }[];

export const WINDOW_OPTIONS = [
  { days: 1, label: msg("Past 24h"), command: "usage.period.day" },
  { days: 7, label: msg("7 days"), command: "usage.period.week" },
  { days: 30, label: msg("30 days"), command: "usage.period.month" },
  { days: 90, label: msg("90 days"), command: "usage.period.quarter" },
] as const;

/** Popups and dialogs whose keys are their own when they open inside the Usage view. */
const NESTED_POPUP_SELECTOR = '[role="dialog"], [aria-modal="true"], [data-slot$="popup"]';

/**
 * The Usage command a key press inside `scope`, the Usage view, asks for. A popup around the view,
 * such as the thread details popover, does not stop it; fields and popups inside it do.
 */
export function resolveUsageShortcut(
  event: ShortcutEventLike & { target: EventTarget | null },
  keybindings: ResolvedKeybindingsConfig,
  scope: Element,
) {
  const target = event.target;
  if (!(target instanceof Element) || !scope.contains(target)) return null;
  if (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  ) {
    return null;
  }
  const popup = target.closest(NESTED_POPUP_SELECTOR);
  if (popup !== null && scope.contains(popup)) return null;

  return resolveShortcutCommand(event, keybindings, {
    context: { usagePageOpen: true },
  });
}
