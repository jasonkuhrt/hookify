import type {
  HookifyEnvelope,
  HookifyEventName,
  HookifyNormalizedEvent,
  HookifyResult,
  HookifyScope,
  HookifyToolKind,
} from "@hookify/schema";
import { HOOKIFY_ENVELOPE_VERSION } from "@hookify/schema";

export const claudeNativeEventNames = [
  "SessionStart",
  "InstructionsLoaded",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "Stop",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "StopFailure",
  "TeammateIdle",
  "ConfigChange",
  "CwdChanged",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "Elicitation",
  "ElicitationResult",
  "SessionEnd",
] as const;
export type ClaudeNativeEventName = (typeof claudeNativeEventNames)[number];

export const claudeEventNameMap = {
  SessionStart: "session-start",
  InstructionsLoaded: "instructions-loaded",
  UserPromptSubmit: "user-prompt-submit",
  PreToolUse: "pre-tool-use",
  PermissionRequest: "permission-request",
  PostToolUse: "post-tool-use",
  PostToolUseFailure: "post-tool-use-failure",
  PermissionDenied: "permission-denied",
  Notification: "notification",
  SubagentStart: "subagent-start",
  Stop: "stop",
  SubagentStop: "subagent-stop",
  TaskCreated: "task-created",
  TaskCompleted: "task-completed",
  StopFailure: "stop-failure",
  TeammateIdle: "teammate-idle",
  ConfigChange: "config-change",
  CwdChanged: "cwd-changed",
  FileChanged: "file-changed",
  WorktreeCreate: "worktree-create",
  WorktreeRemove: "worktree-remove",
  PreCompact: "pre-compact",
  PostCompact: "post-compact",
  Elicitation: "elicitation",
  ElicitationResult: "elicitation-result",
  SessionEnd: "session-end",
} as const;

export interface ClaudeNativeEventBase {
  cwd?: string;
  hook_event_name: ClaudeNativeEventName;
  session_id?: string;
  transcript_path?: string;
  turn_id?: string;
}

export type ClaudeNativeEvent = ClaudeNativeEventBase & Readonly<Record<string, unknown>>;

export interface CreateClaudeEnvelopeOptions<TNativeEvent extends ClaudeNativeEvent> {
  native: TNativeEvent;
  scope: HookifyScope;
  projectRoot: string;
  gitRoot?: string;
}

export const createClaudeEnvelope = <TNativeEvent extends ClaudeNativeEvent>(
  options: CreateClaudeEnvelopeOptions<TNativeEvent>,
): HookifyEnvelope<TNativeEvent> => ({
  version: HOOKIFY_ENVELOPE_VERSION,
  agent: "claude",
  event: claudeEventNameMap[options.native.hook_event_name],
  scope: options.scope,
  meta: {
    cwd: typeof options.native.cwd === "string" ? options.native.cwd : options.projectRoot,
    projectRoot: options.projectRoot,
    ...(options.gitRoot ? { gitRoot: options.gitRoot } : {}),
    ...(typeof options.native.session_id === "string"
      ? { sessionId: options.native.session_id }
      : {}),
    ...(typeof options.native.turn_id === "string" ? { turnId: options.native.turn_id } : {}),
    ...(typeof options.native.transcript_path === "string"
      ? { transcriptPath: options.native.transcript_path }
      : {}),
  },
  normalized: normalizeClaudeEvent(options.native),
  native: options.native,
});

export const toClaudeOutput = (
  event: HookifyEventName,
  result: HookifyResult,
): {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  decision?: "block";
  reason?: string;
  hookSpecificOutput?: Record<string, unknown>;
} => {
  const output: {
    continue?: boolean;
    stopReason?: string;
    suppressOutput?: boolean;
    systemMessage?: string;
    decision?: "block";
    reason?: string;
    hookSpecificOutput?: Record<string, unknown>;
  } = {};

  if (result.systemMessage) {
    output.systemMessage = result.systemMessage;
  }

  if (result.additionalContext) {
    const hookSpecificOutput = toClaudeAdditionalContextOutput(event, result.additionalContext);

    if (hookSpecificOutput) {
      output.hookSpecificOutput = {
        ...output.hookSpecificOutput,
        ...hookSpecificOutput,
      };
    }
  }

  if (result.decision === "block") {
    switch (event) {
      case "pre-tool-use":
        output.hookSpecificOutput = {
          ...output.hookSpecificOutput,
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: result.reason,
        };
        return output;
      case "permission-request":
        output.hookSpecificOutput = {
          ...output.hookSpecificOutput,
          hookEventName: "PermissionRequest",
          decision: {
            behavior: "deny",
            message: result.reason,
          },
        };
        return output;
      case "user-prompt-submit":
      case "post-tool-use":
      case "post-tool-use-failure":
      case "stop":
      case "subagent-stop":
      case "config-change":
        output.decision = "block";
        output.reason = result.reason;
        return output;
      default:
        return output;
    }
  }

  return output;
};

const normalizeClaudeEvent = (native: ClaudeNativeEvent): HookifyNormalizedEvent => {
  const toolName = typeof native.tool_name === "string" ? native.tool_name : undefined;
  const toolInput =
    typeof native.tool_input === "object" && native.tool_input !== null
      ? native.tool_input
      : undefined;
  const toolCommand =
    toolInput && "command" in toolInput && typeof toolInput.command === "string"
      ? toolInput.command
      : undefined;
  const toolKind = toClaudeToolKind(native.hook_event_name, toolName);

  switch (native.hook_event_name) {
    case "PreToolUse":
      return {
        tool: {
          kind: toolKind,
          name: toolName,
          command: toolCommand,
          input: toolInput,
        },
      };
    case "PermissionRequest":
      return {
        tool: {
          kind: toolKind,
          name: toolName,
          command: toolCommand,
          input: toolInput,
        },
      };
    case "PostToolUse":
    case "PostToolUseFailure":
    case "PermissionDenied":
      return {
        tool: {
          kind: toolKind,
          name: toolName,
          command: toolCommand,
          input: toolInput,
          response: native.tool_response,
        },
      };
    case "SessionStart":
      return {
        session: {
          source: typeof native.source === "string" ? native.source : undefined,
        },
      };
    case "UserPromptSubmit":
      return {
        prompt: {
          text: typeof native.prompt === "string" ? native.prompt : undefined,
        },
      };
    case "Stop":
    case "StopFailure":
    case "SubagentStop":
      return {
        assistant: {
          lastMessage:
            typeof native.last_assistant_message === "string"
              ? native.last_assistant_message
              : undefined,
        },
      };
    default:
      return {};
  }
};

const toClaudeToolKind = (
  event: ClaudeNativeEventName,
  toolName: string | undefined,
): HookifyToolKind => {
  if (toolName === "Bash") {
    return "bash";
  }

  if (toolName === "AskUserQuestion" || toolName === "ExitPlanMode") {
    return "question";
  }

  if (event === "PermissionRequest") {
    return "permission";
  }

  return "unknown";
};

const toClaudeAdditionalContextOutput = (
  event: HookifyEventName,
  additionalContext: string,
): Record<string, unknown> | undefined => {
  switch (event) {
    case "session-start":
      return {
        hookEventName: "SessionStart",
        additionalContext,
      };
    case "user-prompt-submit":
      return {
        hookEventName: "UserPromptSubmit",
        additionalContext,
      };
    case "pre-tool-use":
      return {
        hookEventName: "PreToolUse",
        additionalContext,
      };
    case "post-tool-use":
      return {
        hookEventName: "PostToolUse",
        additionalContext,
      };
    case "post-tool-use-failure":
      return {
        hookEventName: "PostToolUseFailure",
        additionalContext,
      };
    default:
      return undefined;
  }
};
