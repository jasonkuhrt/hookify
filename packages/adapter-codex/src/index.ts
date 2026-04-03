import type {
  HookifyEnvelope,
  HookifyEventName,
  HookifyNormalizedEvent,
  HookifyResult,
  HookifyScope,
} from "@hookify/schema";
import { HOOKIFY_ENVELOPE_VERSION } from "@hookify/schema";

export const codexNativeEventNames = [
  "PreToolUse",
  "PostToolUse",
  "SessionStart",
  "UserPromptSubmit",
  "Stop",
] as const;
export type CodexNativeEventName = (typeof codexNativeEventNames)[number];

export const codexEventNameMap = {
  PreToolUse: "pre-tool-use",
  PostToolUse: "post-tool-use",
  SessionStart: "session-start",
  UserPromptSubmit: "user-prompt-submit",
  Stop: "stop",
} as const;

export interface CodexNativeEventBase {
  cwd: string;
  hook_event_name: CodexNativeEventName;
  model: string;
  permission_mode: string;
  session_id: string;
  transcript_path: string;
  turn_id?: string;
}

export interface CodexNativeBashToolEventBase extends CodexNativeEventBase {
  tool_name: "Bash";
  tool_input: {
    command: string;
  } & Readonly<Record<string, unknown>>;
  tool_use_id: string;
}

export interface CodexNativePreToolUseEvent extends CodexNativeBashToolEventBase {
  hook_event_name: "PreToolUse";
}

export interface CodexNativePostToolUseEvent extends CodexNativeBashToolEventBase {
  hook_event_name: "PostToolUse";
  tool_response: unknown;
}

export interface CodexNativeSessionStartEvent extends CodexNativeEventBase {
  hook_event_name: "SessionStart";
  source: "startup" | "resume" | "clear" | (string & {});
}

export interface CodexNativeUserPromptSubmitEvent extends CodexNativeEventBase {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
}

export interface CodexNativeStopEvent extends CodexNativeEventBase {
  hook_event_name: "Stop";
  last_assistant_message: string;
  stop_hook_active: boolean;
}

export type CodexNativeEvent =
  | CodexNativePreToolUseEvent
  | CodexNativePostToolUseEvent
  | CodexNativeSessionStartEvent
  | CodexNativeUserPromptSubmitEvent
  | CodexNativeStopEvent;

export interface CreateCodexEnvelopeOptions<TNativeEvent extends CodexNativeEvent> {
  native: TNativeEvent;
  scope: HookifyScope;
  projectRoot: string;
  gitRoot?: string;
}

export const createCodexEnvelope = <TNativeEvent extends CodexNativeEvent>(
  options: CreateCodexEnvelopeOptions<TNativeEvent>,
): HookifyEnvelope<TNativeEvent> => ({
  version: HOOKIFY_ENVELOPE_VERSION,
  agent: "codex",
  event: codexEventNameMap[options.native.hook_event_name],
  scope: options.scope,
  meta: {
    cwd: options.native.cwd,
    projectRoot: options.projectRoot,
    ...(options.gitRoot ? { gitRoot: options.gitRoot } : {}),
    sessionId: options.native.session_id,
    ...(options.native.turn_id ? { turnId: options.native.turn_id } : {}),
    transcriptPath: options.native.transcript_path,
  },
  normalized: normalizeCodexEvent(options.native),
  native: options.native,
});

export const toCodexOutput = (
  event: HookifyEventName,
  result: HookifyResult,
): {
  decision?: "block";
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: "SessionStart" | "UserPromptSubmit" | "PostToolUse" | "PreToolUse";
    additionalContext?: string;
    permissionDecision?: "deny";
    permissionDecisionReason?: string;
  };
} => {
  const output: {
    decision?: "block";
    reason?: string;
    systemMessage?: string;
    hookSpecificOutput?: {
      hookEventName: "SessionStart" | "UserPromptSubmit" | "PostToolUse" | "PreToolUse";
      additionalContext?: string;
      permissionDecision?: "deny";
      permissionDecisionReason?: string;
    };
  } = {};

  if (result.systemMessage) {
    output.systemMessage = result.systemMessage;
  }

  if (result.decision === "block") {
    if (event === "pre-tool-use") {
      output.hookSpecificOutput = {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: result.reason,
      };

      return output;
    }

    output.decision = "block";
    output.reason = result.reason;
  }

  if (result.additionalContext) {
    switch (event) {
      case "session-start":
        output.hookSpecificOutput = {
          hookEventName: "SessionStart",
          additionalContext: result.additionalContext,
        };
        break;
      case "user-prompt-submit":
        output.hookSpecificOutput = {
          hookEventName: "UserPromptSubmit",
          additionalContext: result.additionalContext,
        };
        break;
      case "post-tool-use":
        output.hookSpecificOutput = {
          hookEventName: "PostToolUse",
          additionalContext: result.additionalContext,
        };
        break;
    }
  }

  return output;
};

const normalizeCodexEvent = (native: CodexNativeEvent): HookifyNormalizedEvent => {
  switch (native.hook_event_name) {
    case "PreToolUse":
      return {
        tool: {
          kind: "bash",
          name: native.tool_name,
          command: native.tool_input.command,
          input: native.tool_input,
        },
      };
    case "PostToolUse":
      return {
        tool: {
          kind: "bash",
          name: native.tool_name,
          command: native.tool_input.command,
          input: native.tool_input,
          response: native.tool_response,
        },
      };
    case "SessionStart":
      return {
        session: {
          source: native.source,
        },
      };
    case "UserPromptSubmit":
      return {
        prompt: {
          text: native.prompt,
        },
      };
    case "Stop":
      return {
        assistant: {
          lastMessage: native.last_assistant_message,
        },
        session: {
          stopHookActive: native.stop_hook_active,
        },
      };
  }
};
