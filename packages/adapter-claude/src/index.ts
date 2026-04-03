import type { HookifyEnvelope, HookifyNormalizedEvent, HookifyScope } from "@hookify/schema";
import { HOOKIFY_ENVELOPE_VERSION } from "@hookify/schema";

export const claudeNativeEventNames = [
  "PreToolUse",
  "PostToolUse",
  "SessionStart",
  "UserPromptSubmit",
  "Stop",
  "Notification",
  "PermissionRequest",
  "SessionEnd",
  "PreCompact",
  "SubagentStop",
] as const;
export type ClaudeNativeEventName = (typeof claudeNativeEventNames)[number];

export const claudeEventNameMap = {
  PreToolUse: "pre-tool-use",
  PostToolUse: "post-tool-use",
  SessionStart: "session-start",
  UserPromptSubmit: "user-prompt-submit",
  Stop: "stop",
  Notification: "notification",
  PermissionRequest: "permission-request",
  SessionEnd: "session-end",
  PreCompact: "pre-compact",
  SubagentStop: "subagent-stop",
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

  switch (native.hook_event_name) {
    case "PreToolUse":
      return {
        tool: {
          kind: toolName === "Bash" ? "bash" : "unknown",
          name: toolName,
          command: toolCommand,
          input: toolInput,
        },
      };
    case "PostToolUse":
      return {
        tool: {
          kind: toolName === "Bash" ? "bash" : "unknown",
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
