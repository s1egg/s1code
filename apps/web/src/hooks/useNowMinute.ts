import { minuteTick } from "@s1tools/client-runtime/clock";
import { useSyncExternalStore } from "react";

export function useNowMinute(): string {
  return useSyncExternalStore(minuteTick.subscribe, minuteTick.getSnapshot, minuteTick.getSnapshot);
}
