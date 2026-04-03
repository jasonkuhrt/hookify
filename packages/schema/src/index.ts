export const HOOKIFY_ENVELOPE_VERSION = 1 as const;

export const hookifyAgents = ["claude", "codex"] as const;
export type HookifyAgent = (typeof hookifyAgents)[number];

export const hookifyApplicabilities = ["all", "claude", "codex"] as const;
export type HookifyApplicability = (typeof hookifyApplicabilities)[number];

export const hookifyScopes = ["user", "project"] as const;
export type HookifyScope = (typeof hookifyScopes)[number];

export const hookifyEvents = [
  "pre-tool-use",
  "post-tool-use",
  "post-tool-use-failure",
  "session-start",
  "instructions-loaded",
  "user-prompt-submit",
  "stop",
  "stop-failure",
  "notification",
  "permission-request",
  "permission-denied",
  "session-end",
  "pre-compact",
  "post-compact",
  "subagent-start",
  "subagent-stop",
  "task-created",
  "task-completed",
  "teammate-idle",
  "config-change",
  "cwd-changed",
  "file-changed",
  "worktree-create",
  "worktree-remove",
  "elicitation",
  "elicitation-result",
] as const;
export type HookifyEventName = (typeof hookifyEvents)[number];

export const hookifyToolKinds = [
  "bash",
  "file",
  "prompt",
  "permission",
  "question",
  "unknown",
] as const;
export type HookifyToolKind = (typeof hookifyToolKinds)[number];

export interface HookifyMeta {
  cwd: string;
  projectRoot: string;
  gitRoot?: string;
  sessionId?: string;
  turnId?: string;
  transcriptPath?: string;
}

export interface HookifyNormalizedTool {
  kind: HookifyToolKind;
  name?: string;
  command?: string;
  matcher?: string;
  input?: unknown;
  response?: unknown;
}

export interface HookifyNormalizedPrompt {
  text?: string;
}

export interface HookifyNormalizedAssistant {
  lastMessage?: string;
}

export interface HookifyNormalizedSession {
  source?: string;
  stopHookActive?: boolean;
}

export interface HookifyNormalizedEvent {
  tool?: HookifyNormalizedTool;
  prompt?: HookifyNormalizedPrompt;
  assistant?: HookifyNormalizedAssistant;
  session?: HookifyNormalizedSession;
}

export interface HookifyEnvelope<Native = unknown> {
  version: typeof HOOKIFY_ENVELOPE_VERSION;
  agent: HookifyAgent;
  event: HookifyEventName;
  scope: HookifyScope;
  meta: HookifyMeta;
  normalized: HookifyNormalizedEvent;
  native: Native;
}

export interface HookifyBlockResult {
  decision: "block";
  reason: string;
  additionalContext?: string;
  systemMessage?: string;
}

export interface HookifyPassResult {
  decision?: "allow";
  additionalContext?: string;
  systemMessage?: string;
}

export type HookifyResult = HookifyBlockResult | HookifyPassResult;
