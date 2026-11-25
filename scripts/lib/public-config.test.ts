// @effect-diagnostics nodeBuiltinImport:off - Tests exercise root env file precedence directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "./public-config.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadRepoEnv", () => {
  it("applies process, root local, and root precedence in that order", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env"),
      "S1CODE_CLERK_PUBLISHABLE_KEY=pk_root\nS1CODE_CLERK_JWT_TEMPLATE=template_root\nS1CODE_CLERK_CLI_OAUTH_CLIENT_ID=oauth_root\nS1CODE_RELAY_URL=https://root.example.test\n",
    );
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env.local"),
      "S1CODE_CLERK_PUBLISHABLE_KEY=pk_local\nS1CODE_CLERK_JWT_TEMPLATE=template_local\nS1CODE_CLERK_CLI_OAUTH_CLIENT_ID=oauth_local\nS1CODE_RELAY_URL=https://local.example.test\n",
    );

    expect(loadRepoEnv({ baseEnv: {}, repoRoot }).S1CODE_RELAY_URL).toBe(
      "https://local.example.test",
    );
    expect(
      loadRepoEnv({
        baseEnv: {
          S1CODE_CLERK_PUBLISHABLE_KEY: "pk_ci",
          S1CODE_CLERK_JWT_TEMPLATE: "template_ci",
          S1CODE_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_ci",
          S1CODE_RELAY_URL: "https://ci.example.test",
        },
        repoRoot,
      }),
    ).toMatchObject({
      S1CODE_CLERK_PUBLISHABLE_KEY: "pk_ci",
      S1CODE_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_ci",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_ci",
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_ci",
      S1CODE_CLERK_JWT_TEMPLATE: "template_ci",
      VITE_CLERK_JWT_TEMPLATE: "template_ci",
      EXPO_PUBLIC_CLERK_JWT_TEMPLATE: "template_ci",
      S1CODE_RELAY_URL: "https://ci.example.test",
      VITE_S1CODE_RELAY_URL: "https://ci.example.test",
    });
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "s1code-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}
