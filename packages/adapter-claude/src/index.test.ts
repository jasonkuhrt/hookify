import { expect, test } from "bun:test";

import { createClaudeEnvelope } from "./index";

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
