import { assert, it } from "@effect/vitest";

import {
  repositoryPathFromRemoteUrl,
  transportSafeSourceControlErrorValue,
} from "./SourceControlProvider.ts";

it("removes URL credentials, query parameters, and fragments from error transport values", () => {
  assert.strictEqual(
    transportSafeSourceControlErrorValue(
      "https://user:secret@example.test/org/repo/pull/42?token=secret#discussion",
    ),
    "https://example.test/org/repo/pull/42",
  );
});

it.each([
  ["git@github.com:S1Tools/s1code.git", "S1Tools/s1code"],
  ["git@github.com:/S1Tools/s1code.git", "S1Tools/s1code"],
  ["github.com:S1Tools/s1code.git", "S1Tools/s1code"],
  ["github.com:/S1Tools/s1code.git", "S1Tools/s1code"],
  ["gitlab.com:S1Tools/platform/s1code", "S1Tools/platform/s1code"],
  ["hg::user@host:Owner/Repo.git", null],
  ["https://github.com/S1Tools/s1code.git", "S1Tools/s1code"],
  ["https://github.com/S1Tools/s1code.git?view=compact", "S1Tools/s1code"],
  ["https://github.com/S1Tools/s1code.git#section", "S1Tools/s1code"],
  ["C:/repos/s1code", null],
  ["file:///tmp/S1Tools/s1code.git", null],
])("reads the repository path of %s", (remoteUrl, expected) => {
  assert.strictEqual(repositoryPathFromRemoteUrl(remoteUrl), expected);
});
