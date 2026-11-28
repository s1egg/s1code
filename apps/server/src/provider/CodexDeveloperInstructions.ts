import type { AgentFeedbackMode } from "@s1tools/contracts";
import type { V2TurnStartParams__AdditionalContextEntry } from "effect-codex-app-server/schema";
import { buildRuntimeInstructions } from "@s1tools/provider-core/server/runtimeInstructions";

import {
  S1_CODE_BROWSER_TOOL_INSTRUCTIONS,
  S1_CODE_DEVICE_TOOL_INSTRUCTIONS,
  t3CodeOrchestrationSections,
} from "@s1tools/provider-core/server/orchestrationInstructions";

/** Codex silently truncates additionalContext values over 1,000 tokens, counted as UTF-8 bytes / 4. */
export const CODEX_ADDITIONAL_CONTEXT_VALUE_MAX_BYTES = 4_000;

export interface S1CodeToolAvailability {
  readonly browser: boolean;
  readonly device: boolean;
  readonly nativeSubagents?: boolean;
}

const normalizeAvailability = (
  availability: boolean | S1CodeToolAvailability,
): S1CodeToolAvailability =>
  typeof availability === "boolean" ? { browser: availability, device: false } : availability;

/** Instructions for unavailable tools would steer the model away from its remaining automation. */
const toolInstructions = (tools: S1CodeToolAvailability): string =>
  [
    tools.browser ? S1_CODE_BROWSER_TOOL_INSTRUCTIONS : "",
    tools.device ? S1_CODE_DEVICE_TOOL_INSTRUCTIONS : "",
  ]
    .filter(Boolean)
    .join("\n\n");

export interface CodexRuntimeInfo {
  readonly agentFeedback?: AgentFeedbackMode;
  readonly model: string;
  readonly modelName?: string | undefined;
  readonly reasoningEffort?: string | undefined;
}

/** Keep this outside collaboration mode; model-catalog mode text overrides client developer_instructions. */
export function buildCodexAdditionalContext(
  runtime: CodexRuntimeInfo,
  toolsAvailable: boolean | S1CodeToolAvailability = true,
): Record<string, V2TurnStartParams__AdditionalContextEntry> {
  const availability = normalizeAvailability(toolsAvailable);
  const tools = toolInstructions(availability);
  // Split values to fit per-entry caps; number keys because Codex emits them in key order.
  return {
    ...Object.fromEntries(
      t3CodeOrchestrationSections(availability.nativeSubagents).map((section, index) => [
        `s1_code_orchestration_${String(index + 1).padStart(2, "0")}`,
        { kind: "application" as const, value: section },
      ]),
    ),
    s1_code_runtime: {
      kind: "application",
      value: buildRuntimeInstructions({ harness: "Codex", ...runtime }),
    },
    ...(tools ? { s1_code_tools: { kind: "application", value: tools } } : {}),
  };
}
