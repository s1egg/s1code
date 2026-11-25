import { AgentFeedbackKind, AgentFeedbackTrace } from "@s1tools/contracts";
import { resolveT3McpToolId } from "@s1tools/shared/t3McpToolPresentation";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

// Code points, as the scrubber caps them, so a valid input stays a valid report after redaction.
const FeedbackText = Schema.String.check(Schema.isMaxCodePoints(300));

/** Turns the outline of a requested report covers at least. */
export const FEEDBACK_TRACE_TURNS = 5;

const reportFields = {
  kind: AgentFeedbackKind,
  subject: Schema.String.annotate({ description: "S1 tool name, `s1` command, or `general`." }),
  expected: FeedbackText,
  actual: FeedbackText,
  workaround: FeedbackText.annotate({ description: "What you did instead, or empty." }),
  // Annotate before the default: an annotation after it never reaches the JSON schema.
  userRequested: Schema.Boolean.annotate({ description: "The user asked for this report." }).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(false)),
  ),
};

export const FeedbackInput = Schema.Struct({
  ...reportFields,
  turns: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
    .annotate({
      description: "How many recent turns, counting this one, the problem spans.",
    })
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
});

export const FeedbackTrace = AgentFeedbackTrace;
export type FeedbackTrace = AgentFeedbackTrace;

const storedFields = {
  id: Schema.String,
  threadId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  source: Schema.Literals(["mcp", "cli"]),
  sent: Schema.Boolean,
};

export const FeedbackReport = Schema.Struct({
  ...reportFields,
  ...storedFields,
  trace: Schema.NullOr(FeedbackTrace),
});

/** What `s1_feedback` answers: the report, with only the size of what its trace attached. */
export const FeedbackSubmitResult = Schema.Struct({
  ...reportFields,
  ...storedFields,
  trace: Schema.NullOr(FeedbackTrace.mapFields(Struct.omit(["entries"]))),
});

export const FEEDBACK_AWAITING_APPROVAL_NOTE =
  "The user sees this report in a card and chooses there whether to send it and whether to include the conversation. Nothing is sent until they do, and you will not learn their choice. Do not wait for it or send it another way. Call again only if the user asks to change it; that shows a new card.";

/** What `s1_feedback` answers for a requested report: shown to the user, not yet sent. */
export const FeedbackAwaitingApproval = Schema.Struct({
  status: Schema.Literal("awaiting_approval"),
  note: Schema.String,
});
export type FeedbackAwaitingApproval = typeof FeedbackAwaitingApproval.Type;

export const FEEDBACK_OFF_MESSAGE =
  "Agent feedback is off. Turn it on in S1 Code under Settings > Labs, then try again.";

export class FeedbackOffError extends Schema.TaggedError<FeedbackOffError>()(
  "FeedbackOffError",
  {},
) {
  override get message() {
    return FEEDBACK_OFF_MESSAGE;
  }
}

export type FeedbackSource = "mcp" | "cli";

// Requested reports count when their card is shown, unprompted ones when stored.
export const MAX_REPORTS_PER_TURN = 3;
// Reports from no turn, such as `s1 feedback`, have no turn to count in.
export const MAX_REPORTS_OUTSIDE_TURNS_PER_HOUR = 10;

export class FeedbackLimitError extends Schema.TaggedError<FeedbackLimitError>()(
  "FeedbackLimitError",
  { scope: Schema.Literals(["turn", "hour", "cards"]) },
) {
  override get message() {
    switch (this.scope) {
      case "turn":
        return `This turn already sent ${MAX_REPORTS_PER_TURN} agent feedback reports; nothing was sent.`;
      case "cards":
        return `This turn already showed the user ${MAX_REPORTS_PER_TURN} agent feedback reports to approve; nothing was shown.`;
      case "hour":
        return `This machine already sent ${MAX_REPORTS_OUTSIDE_TURNS_PER_HOUR} agent feedback reports outside a turn in the last hour; nothing was sent.`;
    }
  }
}

export class FeedbackNotRequestedError extends Schema.TaggedError<FeedbackNotRequestedError>()(
  "FeedbackNotRequestedError",
  { source: Schema.Literals(["mcp", "cli"]) },
) {
  override get message() {
    return this.source === "cli"
      ? "Agent feedback is set to When I ask: ask your agent in a thread to send it, so you can approve what is sent."
      : "Agent feedback is set to When I ask: send a report only when the user asks for one.";
  }
}

export class FeedbackStorageError extends Schema.TaggedError<FeedbackStorageError>()(
  "FeedbackStorageError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Could not save agent feedback.";
  }
}

/** The MCP client label `s1 feedback` signs in with, so its reports count as `cli`. */
export const FEEDBACK_CLI_CLIENT_LABEL = "s1 feedback cli";

/** Listed `s1` command paths a report may name. A CLI test keeps this in step with binCli. */
export const S1_CLI_COMMANDS: ReadonlyArray<string> = [
  "s1",
  "s1 help",
  "s1 serve",
  "s1 app",
  "s1 pair",
  "s1 auth",
  "s1 auth connect-device",
  "s1 auth connect-device approve",
  "s1 auth connect-device list",
  "s1 auth connect-device revoke",
  "s1 auth pairing",
  "s1 auth pairing create",
  "s1 auth pairing list",
  "s1 auth pairing revoke",
  "s1 auth session",
  "s1 auth session issue",
  "s1 auth session list",
  "s1 auth session revoke",
  "s1 environment",
  "s1 environment link",
  "s1 environment list",
  "s1 environment unlink",
  "s1 browser",
  "s1 browser setup",
  "s1 project",
  "s1 project add",
  "s1 project remove",
  "s1 project rename",
  "s1 thread",
  "s1 thread list",
  "s1 thread start",
  "s1 thread send",
  "s1 thread show",
  "s1 feedback",
  "s1 feedback list",
  "s1 workflow",
  "s1 workflow start",
  "s1 workflow list",
  "s1 workflow show",
  "s1 workflow resume",
  "s1 workflow cancel",
  "s1 workflow signal",
  "s1 workflow withdraw",
  "s1 workflow questions",
  "s1 workflow hooks",
  "s1 workflow store",
  "s1 workflow store list",
  "s1 workflow store set",
  "s1 workflow store delete",
  "s1 up",
  "s1 status",
  "s1 service",
  "s1 service install",
  "s1 service restart",
  "s1 service uninstall",
  "s1 service status",
  "s1 service protect",
  "s1 update",
  "s1 install",
  "s1 uninstall",
  "s1 theme",
  "s1 theme set",
  "s1 theme clear",
  "s1 theme show",
  "s1 trace",
  "s1 trace summary",
  "s1 doctor",
  "s1 policy",
  "s1 policy show",
  "s1 policy check",
  "s1 policy templates",
  "s1 policy settings",
  "s1 triage",
  "s1 connect",
  "s1 connect link",
  "s1 connect login",
  "s1 connect logout",
  "s1 connect publish",
  "s1 connect status",
  "s1 connect unlink",
];

export type FeedbackInput = typeof FeedbackInput.Type;
export type FeedbackReport = typeof FeedbackReport.Type;

export const FEEDBACK_SUBJECT_MESSAGE =
  "Set subject to the exact S1 tool name, the s1 command, or `general`.";

// The shared resolver knows the presented tools; the prefix covers the rest, such as these.
// Codex also registers `s1-code-direct` for S1 tools it keeps out of Code Mode.
const S1_PREFIX = /^(?:mcp__s1[-_]?code(?:[-_]direct)?__|s1[-_]?code(?:[-_]direct)?[.:/])/iu;

/** The bare name of a registered S1 tool however a provider prefixed it, else undefined. */
export const resolveT3ToolName = (name: string, toolNames: ReadonlyArray<string>) => {
  const tool = resolveT3McpToolId(name) ?? name.replace(S1_PREFIX, "");
  if (toolNames.includes(tool)) return tool;
  // OpenCode 2 prefixes tools with `s1-code-<thread>_`, underscores and all: the longest name wins.
  if (!/^s1-code-/iu.test(name)) return undefined;
  return toolNames
    .filter((candidate) => name.endsWith(`_${candidate}`))
    .toSorted((a, b) => b.length - a.length)[0];
};

/** The stored subject, or undefined when the value names no S1 tool, `s1` command, or `general`. */
export const resolveFeedbackSubject = (value: string, toolNames: ReadonlyArray<string>) => {
  const subject = value.trim();
  if (subject === "general" || S1_CLI_COMMANDS.includes(subject)) return subject;
  return resolveT3ToolName(subject, toolNames);
};
