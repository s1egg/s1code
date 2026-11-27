import { EnvironmentId, ProjectId } from "@s1tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { m } from "../i18n/messages";
import { buildEnvironmentOption } from "./useLogicalProjectEnvironments";

const primaryEnvironmentId = EnvironmentId.make("environment-primary");
const option = (environmentId: EnvironmentId, label: string) =>
  buildEnvironmentOption(
    {
      environmentId,
      projectId: ProjectId.make("project-1"),
      primaryEnvironmentId,
      environment: { label, serverConfig: null },
    },
    m,
  );

describe("buildEnvironmentOption", () => {
  it("names a generically labeled primary environment This device", () => {
    expect(option(primaryEnvironmentId, "Local").label).toBe("This device");
    expect(option(primaryEnvironmentId, "Local environment").label).toBe("This device");
  });

  it("keeps a named machine's own label", () => {
    expect(option(primaryEnvironmentId, "Studio Mac").label).toBe("Studio Mac");
    const remote = option(EnvironmentId.make("environment-remote"), "Build box");
    expect(remote).toMatchObject({ label: "Build box", isPrimary: false });
  });
});
