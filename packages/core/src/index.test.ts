import { expect, test } from "bun:test";

import {
  isEligibleApplicability,
  parseHookFileName,
  parseMarkdownHandler,
  toHookEnvironment,
} from "./index";

test("parseHookFileName recognizes ordered shared hooks", () => {
  expect(parseHookFileName("/tmp/10-block-cmux.all.ts")).toEqual({
    orderPrefix: 10,
    name: "block-cmux",
    applicability: "all",
    runtime: "ts",
  });
});

test("parseHookFileName recognizes markdown handlers", () => {
  expect(parseHookFileName("/tmp/persist-noted-issues.all.md")).toEqual({
    name: "persist-noted-issues",
    applicability: "all",
    runtime: "md",
  });
});

test("parseHookFileName rejects unsupported names", () => {
  expect(parseHookFileName("/tmp/pre-tool-use.ts")).toBeNull();
});

test("parseMarkdownHandler extracts frontmatter and body", () => {
  const content = [
    "---",
    "decision: block",
    'reason: "cmux is forbidden"',
    "enabled: true",
    "---",
    "",
    "Long-form explanation.",
    "Second paragraph.",
  ].join("\n");

  expect(parseMarkdownHandler(content)).toEqual({
    frontmatter: {
      decision: "block",
      reason: "cmux is forbidden",
      enabled: true,
    },
    body: "Long-form explanation.\nSecond paragraph.",
  });
});

test("parseMarkdownHandler treats files without frontmatter as body-only", () => {
  expect(parseMarkdownHandler("Just a reminder.\n")).toEqual({
    frontmatter: {},
    body: "Just a reminder.",
  });
});

test("parseMarkdownHandler ignores comments and blanks in frontmatter", () => {
  const content = [
    "---",
    "# a comment",
    "emit: additionalContext  # inline comment",
    "",
    "enabled: false",
    "---",
    "body text",
  ].join("\n");

  expect(parseMarkdownHandler(content)).toEqual({
    frontmatter: { emit: "additionalContext", enabled: false },
    body: "body text",
  });
});

test("parseMarkdownHandler handles unterminated frontmatter as body-only", () => {
  const content = ["---", "decision: block", "body without close"].join("\n");

  expect(parseMarkdownHandler(content)).toEqual({
    frontmatter: {},
    body: "---\ndecision: block\nbody without close",
  });
});

test("isEligibleApplicability matches shared and agent-specific hooks", () => {
  expect(isEligibleApplicability("codex", "all")).toBeTrue();
  expect(isEligibleApplicability("codex", "codex")).toBeTrue();
  expect(isEligibleApplicability("codex", "claude")).toBeFalse();
});

test("toHookEnvironment exports the stable hookify env contract", () => {
  const environment = toHookEnvironment({
    version: 1,
    agent: "codex",
    event: "pre-tool-use",
    scope: "project",
    meta: {
      cwd: "/worktree",
      projectRoot: "/worktree",
      gitRoot: "/worktree",
      sessionId: "session_123",
      turnId: "turn_7",
      transcriptPath: "/tmp/transcript.jsonl",
    },
    normalized: {},
    native: {},
  });

  expect(environment).toMatchObject({
    HOOKIFY_AGENT: "codex",
    HOOKIFY_EVENT: "pre-tool-use",
    HOOKIFY_SCOPE: "project",
    HOOKIFY_CWD: "/worktree",
    HOOKIFY_PROJECT_ROOT: "/worktree",
    HOOKIFY_GIT_ROOT: "/worktree",
    HOOKIFY_SESSION_ID: "session_123",
    HOOKIFY_TURN_ID: "turn_7",
    HOOKIFY_TRANSCRIPT_PATH: "/tmp/transcript.jsonl",
    HOOKIFY_FORMAT: "hookify.v1",
  });
});
