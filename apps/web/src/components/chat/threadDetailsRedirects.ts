import type { ScopedThreadRef } from "@s1tools/contracts";
import { redirect } from "@tanstack/react-router";

import { getThreadViewHref } from "../sidebar/mainAppLocation";
import {
  openThreadDetailsDrillIn,
  type ThreadDetailsDrillInId,
  withThreadDetails,
} from "./threadDetailsStore";

/**
 * The old Usage, Pull requests and Issues pages live in the thread sidebar now: their addresses
 * lead to the last thread with that view open, and anything they had selected in its right panel.
 */
export function redirectToThreadDetails(
  drillIn: ThreadDetailsDrillInId,
  openInPanel?: (threadRef: ScopedThreadRef) => void,
  options?: {
    /** The address named project filters, saved with the list's preferences, to open with. */
    readonly explicitListScope?: boolean;
  },
): never {
  openThreadDetailsDrillIn(drillIn, { ...options, reloadList: true });
  if (openInPanel) withThreadDetails((attached) => openInPanel(attached.threadRef));
  throw redirect({ href: getThreadViewHref(), replace: true });
}
