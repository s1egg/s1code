import type { ScopedThreadRef } from "@s1tools/contracts";
import { redirect } from "@tanstack/react-router";

import { getMainAppHref } from "../sidebar/mainAppLocation";
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
): never {
  openThreadDetailsDrillIn(drillIn);
  if (openInPanel) withThreadDetails((attached) => openInPanel(attached.threadRef));
  throw redirect({ href: getMainAppHref(), replace: true });
}
