import { expect, test } from "bun:test";

import { createClaudeEnvelope, toClaudeOutput } from "./index";

test("createClaudeEnvelope preserves raw payloads and normalizes shared fields when present", () => {
  const envelope = createClaudeEnvelope({
    scope: "user",
    projectRoot: "/repo",
    native: {
      hook_event_name: "UserPromptSubmit",
      cwd: "/repo",
      session_id: "session_123",
      prompt: "please avoid cmux",
    },
  });

  expect(envelope).toMatchObject({
    agent: "claude",
    event: "user-prompt-submit",
    scope: "user",
    meta: {
      cwd: "/repo",
      projectRoot: "/repo",
      sessionId: "session_123",
    },
    normalized: {
      prompt: {
        text: "please avoid cmux",
      },
    },
  });
});

test("toClaudeOutput maps shared Hookify results into Claude event-specific control shapes", () => {
  expect(
    toClaudeOutput("pre-tool-use", {
      decision: "block",
      reason: "cmux is forbidden",
      additionalContext: "User policy applies.",
    }),
  ).toEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "cmux is forbidden",
      additionalContext: "User policy applies.",
    },
  });

  expect(
    toClaudeOutput("user-prompt-submit", {
      decision: "block",
      reason: "Prompt rejected",
      additionalContext: "Project policy reminder.",
      systemMessage: "Please revise.",
    }),
  ).toEqual({
    decision: "block",
    reason: "Prompt rejected",
    systemMessage: "Please revise.",
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "Project policy reminder.",
    },
  });
});
