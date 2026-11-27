import { createFileRoute } from "@tanstack/react-router";

import { redirectToThreadDetails } from "../components/chat/threadDetailsRedirects";

export const Route = createFileRoute("/_chat/usage")({
  beforeLoad: () => redirectToThreadDetails("usage"),
});
