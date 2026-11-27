import { toServerClock } from "@s1tools/client-runtime/clock";
import type { EnvironmentId } from "@s1tools/contracts";
import { formatDuration } from "@s1tools/shared/orchestrationTimingCopy";
import { msg } from "gt-react";
import { m } from "~/i18n/messages";

export function formatWorkingTimerNow(startIso: string, environmentId: EnvironmentId): string {
  const startedAtMs = Date.parse(startIso);
  if (!Number.isFinite(startedAtMs)) {
    return m(msg("{seconds}s", { seconds: 0 }));
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((toServerClock(environmentId, Date.now()) - startedAtMs) / 1000),
  );
  if (elapsedSeconds < 60) {
    return m(msg("{seconds}s", { seconds: elapsedSeconds }));
  }

  return formatDuration(elapsedSeconds * 1_000, m);
}

/** A running turn's clock: "m:ss", or "h:mm:ss" from an hour. */
export function formatTurnClock(elapsedMs: number): string {
  const total = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}
