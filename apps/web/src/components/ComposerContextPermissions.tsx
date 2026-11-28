import type { EnvironmentId, ProviderInstanceId, RuntimeMode } from "@s1tools/contracts";
import { use } from "react";
import { useGT, useMessages } from "gt-react";

import { useManagedPolicy } from "../state/managedPolicy";
import {
  RuntimeModeLimitsTargetContext,
  runtimeModeLimitsTarget,
  useProviderRuntimeModeLimits,
} from "../state/runtimeModeLimits";
import { HiddenThreadContext } from "./chat/backgroundThread";
import { ComposerControl } from "./chat/ComposerControl";
import { ComposerPermissionsSection } from "./chat/ComposerFooterControls";
import { useComposerMenuProps } from "./chat/composerEventScope";
import { useComposerMenuState } from "./chat/useComposerMenuState";
import {
  resolveCompatibleRuntimeMode,
  resolveRuntimeModeOptions,
  runtimeModeConfig,
} from "./chat/runtimeModeConfig";
import { ComposerContextLabel } from "./ComposerContextLabel";
import { Menu, MenuPopup, MenuTrigger } from "./ui/menu";

export function ComposerContextPermissions(props: {
  environmentId: EnvironmentId | null;
  runtimeMode: RuntimeMode;
  supportedRuntimeModes: ReadonlyArray<RuntimeMode> | undefined;
  /** The one provider this draft sends to and its folder; undefined for a multi-model send. */
  instanceId: ProviderInstanceId | undefined;
  cwd: string | null;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  const gt = useGT();
  const messages = useMessages();
  const { mode, modes } = resolveCompatibleRuntimeMode(
    props.runtimeMode,
    props.supportedRuntimeModes,
  );
  const limitsFor = runtimeModeLimitsTarget(props.environmentId, props.instanceId, props.cwd);
  const options = resolveRuntimeModeOptions(
    modes,
    useManagedPolicy(props.environmentId),
    messages,
    useProviderRuntimeModeLimits(limitsFor),
  );
  const composerMenuProps = useComposerMenuProps();
  const [open, setOpen] = useComposerMenuState(use(HiddenThreadContext));
  const { icon: Icon } = runtimeModeConfig[mode];
  const label = messages(runtimeModeConfig[mode].label);
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        render={
          <ComposerControl
            size="xs"
            className="ms-auto min-w-0 shrink-0"
            aria-label={gt("Permissions: {label}", { label })}
            data-composer-context-control
          />
        }
      >
        <Icon aria-hidden="true" className="size-3" />
        <ComposerContextLabel>{label}</ComposerContextLabel>
      </MenuTrigger>
      <MenuPopup side="top" align="end" {...composerMenuProps}>
        <RuntimeModeLimitsTargetContext value={limitsFor}>
          <ComposerPermissionsSection
            runtimeMode={mode}
            runtimeModeOptions={options}
            onRuntimeModeChange={props.onRuntimeModeChange}
          />
        </RuntimeModeLimitsTargetContext>
      </MenuPopup>
    </Menu>
  );
}
