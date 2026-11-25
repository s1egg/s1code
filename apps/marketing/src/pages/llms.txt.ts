import type { APIRoute } from "astro";

import { GITHUB_REPOSITORY_URL } from "../lib/site";
import { SITE_TAGLINE } from "../lib/seo";

// https://llmstxt.org: a plain index. This repository is an unofficial fork.
export const GET: APIRoute = () => {
  const body = `# S1 Code

> ${SITE_TAGLINE}. S1 Code is an unofficial fork of T3 Code. It is MIT-licensed and runs Claude Code, Codex, Cursor, OpenCode, Grok, Antigravity, and other coding agents from one desktop, web, and mobile app.

This project is not the official T3 Code product and is not affiliated with T3 Tools, Inc. Official T3 Code lives at https://github.com/pingdotgg/t3code. Builds of this fork come from ${GITHUB_REPOSITORY_URL}/releases.

## Links

- [Source code](${GITHUB_REPOSITORY_URL}): this fork
- [Releases](${GITHUB_REPOSITORY_URL}/releases): release builds and changelogs
- [Upstream](https://github.com/pingdotgg/t3code): T3 Code
- [Security](${GITHUB_REPOSITORY_URL}/security): report vulnerabilities in this fork
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
