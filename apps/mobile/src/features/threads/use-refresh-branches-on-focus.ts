import { RegistryContext } from "@effect/atom-react";
import { useFocusEffect } from "@react-navigation/native";
import { runAtomCommand } from "@s1tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@s1tools/contracts";
import { useCallback, useContext } from "react";

import { vcsEnvironment } from "../../state/vcs";

export function useRefreshBranchesOnFocus(
  environmentId: EnvironmentId | undefined,
  cwd: string | null | undefined,
) {
  const registry = useContext(RegistryContext);
  useFocusEffect(
    useCallback(() => {
      if (environmentId === undefined || !cwd) return;
      void runAtomCommand(
        registry,
        vcsEnvironment.refreshLocalStatusForPicker,
        { environmentId, input: { cwd } },
        { reportFailure: false },
      );
    }, [cwd, environmentId, registry]),
  );
}
