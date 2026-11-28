import type { ScopedThreadRef } from "@s1tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";

import { resolveThreadRouteTarget } from "../../threadRoutes";
import { getThreadViewHref, isAppModalPage } from "../sidebar/mainAppLocation";
import {
  isThreadDetailsDrillInShown,
  openThreadDetailsDrillIn,
  type ThreadDetailsDrillInId,
  toggleThreadDetailsDrillIn,
  withThreadDetails,
} from "./threadDetailsStore";

function onThreadView(router: AnyRouter) {
  return (
    resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {}) !== null &&
    !isAppModalPage(router.state.location.pathname)
  );
}

/** Leaves Settings, a utility page or the new-thread prompt for the last thread, where the thread sidebar lives. */
async function showThreadView(router: AnyRouter) {
  if (!onThreadView(router)) await router.navigate({ href: getThreadViewHref() });
}

/** Opens a thread sidebar drill-in from anywhere in the app. */
export async function showThreadDetailsDrillIn(router: AnyRouter, drillIn: ThreadDetailsDrillInId) {
  await showThreadView(router);
  openThreadDetailsDrillIn(drillIn);
}

/** Opens a drill-in from anywhere, or closes it again when the thread on screen shows it. */
export async function toggleThreadDetailsDrillInFromAnywhere(
  router: AnyRouter,
  drillIn: ThreadDetailsDrillInId,
) {
  if (onThreadView(router) && isThreadDetailsDrillInShown(drillIn)) {
    toggleThreadDetailsDrillIn(drillIn);
    return;
  }
  await showThreadDetailsDrillIn(router, drillIn);
}

/** Runs `open` with the thread shown, such as to open a pull request in its right panel. */
export async function openInShownThread(
  router: AnyRouter,
  open: (threadRef: ScopedThreadRef) => void,
) {
  await showThreadView(router);
  withThreadDetails((attached) => open(attached.threadRef));
}
