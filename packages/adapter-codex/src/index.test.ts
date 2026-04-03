import { expect, test } from "bun:test";

import { createCodexEnvelope, toCodexOutput } from "./index";

test("createCodexEnvelope normalizes Bash PreToolUse payloads", () => {
  const envelope = createCodexEnvelope({
    scope: "project",
    projectRoot: "/repo",
    gitRoot: "/repo",
    native: {
      cwd: "/repo",
      hook_event_name: "PreToolUse",
      model: "gpt-5",
      permission_mode: "workspace-write",
      session_id: "session_123",
      transcript_path: "/tmp/transcript.jsonl",
      turn_id: "turn_7",
      tool_name: "Bash",
      tool_input: {
        command: "cmux list-workspaces",
      },
      tool_use_id: "toolu_123",
    },
  });

  expect(envelope).toMatchObject({
    agent: "codex",
    event: "pre-tool-use",
    scope: "project",
    meta: {
      cwd: "/repo",
      projectRoot: "/repo",
      gitRoot: "/repo",
      sessionId: "session_123",
      turnId: "turn_7",
      transcriptPath: "/tmp/transcript.jsonl",
    },
    normalized: {
      tool: {
        kind: "bash",
        name: "Bash",
        command: "cmux list-workspaces",
      },
    },
  });
});

test("toCodexOutput preserves block decisions and warnings", () => {
  expect(
    toCodexOutput("pre-tool-use", {
      decision: "block",
      reason: "cmux is forbidden",
      systemMessage: "blocked by policy",
    }),
  ).toEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "cmux is forbidden",
    },
    systemMessage: "blocked by policy",
  });

  expect(
    toCodexOutput("session-start", {
      additionalContext: "Load the project guide.",
    }),
  ).toEqual({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "Load the project guide.",
    },
  });

  expect(
    toCodexOutput("stop", {
      systemMessage: "Heads up",
    }),
  ).toEqual({
    systemMessage: "Heads up",
  });
});
