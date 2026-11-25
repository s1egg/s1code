import { type EnvironmentConnectionPhase } from "@s1tools/client-runtime/connection";
import type { MarkedText } from "@s1tools/client-runtime/errors";
import { EnvironmentId, ThreadId, type ServerConfig } from "@s1tools/contracts";

export interface EnvironmentRuntimeState {
  readonly connectionState: EnvironmentConnectionPhase;
  readonly connectionError: string | null;
  readonly i18nConnectionError?: MarkedText;
  readonly connectionErrorTraceId: string | null;
  /** Reconnecting only because the host has not approved this device yet. */
  readonly connectionAwaitingApproval?: true;
  readonly serverConfig: ServerConfig | null;
}

export interface ConnectedEnvironmentSummary {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly displayUrl: string;
  readonly isRelayManaged: boolean;
  readonly isEnabled: boolean;
  readonly connectionState: EnvironmentConnectionPhase;
  readonly connectionError: string | null;
  readonly i18nConnectionError?: MarkedText;
  readonly connectionErrorTraceId: string | null;
}

export interface SelectedThreadRef {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}
