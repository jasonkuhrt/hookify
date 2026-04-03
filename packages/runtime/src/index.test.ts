import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { HookifyEnvelope } from "@hookify/schema";

import {
  discoverHookifyHandlers,
  executeHookifyHandlers,
  resolveHookifyRuntimeContext,
  withScope,
} from "./index";

const createEnvelope = (cwd = process.cwd()): HookifyEnvelope => ({
  version: 1,
  agent: "codex",
  event: "pre-tool-use",
  scope: "project",
  meta: {
    cwd,
    projectRoot: cwd,
    gitRoot: cwd,
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
  native: {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: {
      command: "cmux list-workspaces",
    },
  },
});

test("resolveHookifyRuntimeContext discovers user scope plus nested project hookify roots", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-runtime-"));

  try {
    const homeDirectoryPath = join(workspacePath, "home");
    const actualProjectRootPath = join(workspacePath, "repo");
    const nestedProjectRootPath = join(actualProjectRootPath, "packages", "app");
    const linkedWorkingDirectoryPath = join(workspacePath, "linked-app");

    await mkdir(join(homeDirectoryPath, ".hookify"), { recursive: true });
    await mkdir(join(actualProjectRootPath, ".git"), { recursive: true });
    await mkdir(join(actualProjectRootPath, ".hookify"), { recursive: true });
    await mkdir(join(nestedProjectRootPath, ".hookify"), { recursive: true });
    await symlink(nestedProjectRootPath, linkedWorkingDirectoryPath);
    const resolvedHomeDirectoryPath = await realpath(homeDirectoryPath);
    const resolvedActualProjectRootPath = await realpath(actualProjectRootPath);
    const resolvedNestedProjectRootPath = await realpath(nestedProjectRootPath);

    const context = await resolveHookifyRuntimeContext({
      cwd: linkedWorkingDirectoryPath,
      homeDirectory: homeDirectoryPath,
    });

    expect(context).toEqual({
      cwd: resolvedNestedProjectRootPath,
      projectRoot: resolvedNestedProjectRootPath,
      gitRoot: resolvedActualProjectRootPath,
      roots: [
        {
          scope: "user",
          rootPath: resolvedHomeDirectoryPath,
        },
        {
          scope: "project",
          rootPath: resolvedActualProjectRootPath,
        },
        {
          scope: "project",
          rootPath: resolvedNestedProjectRootPath,
        },
      ],
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("discoverHookifyHandlers filters by applicability and de-dupes symlinked files", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-runtime-"));

  try {
    const userRootPath = join(workspacePath, "user");
    const projectRootPath = join(workspacePath, "project");
    const sharedHookPath = join(workspacePath, "shared-hook.all.ts");

    await mkdir(join(userRootPath, ".hookify", "pre-tool-use"), { recursive: true });
    await mkdir(join(projectRootPath, ".hookify", "pre-tool-use"), { recursive: true });

    await Bun.write(sharedHookPath, `console.log(JSON.stringify({ systemMessage: "shared" }));`);
    await Bun.write(
      join(userRootPath, ".hookify", "pre-tool-use", "20-user-only.codex.ts"),
      `console.log(JSON.stringify({ systemMessage: "user" }));`,
    );
    await Bun.write(
      join(projectRootPath, ".hookify", "pre-tool-use", "30-project-only.claude.ts"),
      `console.log(JSON.stringify({ systemMessage: "project" }));`,
    );
    await symlink(
      sharedHookPath,
      join(userRootPath, ".hookify", "pre-tool-use", "10-shared.all.ts"),
    );
    await symlink(
      sharedHookPath,
      join(projectRootPath, ".hookify", "pre-tool-use", "10-shared-link.all.ts"),
    );

    const handlers = await discoverHookifyHandlers({
      envelope: createEnvelope(),
      roots: [
        { scope: "user", rootPath: userRootPath },
        { scope: "project", rootPath: projectRootPath },
      ],
    });

    expect(
      handlers.map((handler) => ({
        scope: handler.scope,
        name: handler.name,
        applicability: handler.applicability,
      })),
    ).toEqual([
      {
        scope: "user",
        name: "shared",
        applicability: "all",
      },
      {
        scope: "user",
        name: "user-only",
        applicability: "codex",
      },
    ]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("executeHookifyHandlers runs mixed handler runtimes and aggregates block decisions", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-runtime-"));

  try {
    const userRootPath = join(workspacePath, "user");
    const projectRootPath = join(workspacePath, "project");

    await mkdir(join(userRootPath, ".hookify", "pre-tool-use"), { recursive: true });
    await mkdir(join(projectRootPath, ".hookify", "pre-tool-use"), { recursive: true });

    await Bun.write(
      join(userRootPath, ".hookify", "pre-tool-use", "10-explain.all.ts"),
      [
        "const envelope = JSON.parse(await Bun.stdin.text());",
        "console.log(JSON.stringify({",
        "  systemMessage: `${process.env.HOOKIFY_SCOPE}:${envelope.normalized.tool.command}`",
        "}));",
      ].join("\n"),
    );

    await Bun.write(
      join(projectRootPath, ".hookify", "pre-tool-use", "20-block.all.sh"),
      [
        "#!/bin/bash",
        "set -euo pipefail",
        'ENVELOPE=$(cat "$HOOKIFY_ENVELOPE_PATH")',
        'if grep -q "cmux" <<<"$ENVELOPE"; then',
        '  echo "cmux is forbidden" >&2',
        "  exit 2",
        "fi",
      ].join("\n"),
    );

    const report = await executeHookifyHandlers({
      envelope: withScope(createEnvelope(projectRootPath), "project"),
      roots: [
        { scope: "user", rootPath: userRootPath },
        { scope: "project", rootPath: projectRootPath },
      ],
    });

    expect(report.handlers.map((handler) => handler.status)).toEqual(["allowed", "blocked"]);
    expect(report.aggregatedResult).toEqual({
      decision: "block",
      reason: "cmux is forbidden",
      systemMessage: "user:cmux list-workspaces",
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("executeHookifyHandlers fails open on invalid JSON and turns plain text stdout into a warning", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-runtime-"));

  try {
    const projectRootPath = join(workspacePath, "project");

    await mkdir(join(projectRootPath, ".hookify", "stop"), { recursive: true });

    await Bun.write(
      join(projectRootPath, ".hookify", "stop", "10-warning.all.ts"),
      `console.log("run one more pass");`,
    );
    await Bun.write(
      join(projectRootPath, ".hookify", "stop", "20-invalid.all.ts"),
      `console.log(JSON.stringify({ nope: true }));`,
    );

    const report = await executeHookifyHandlers({
      envelope: {
        ...createEnvelope(projectRootPath),
        event: "stop",
        normalized: {
          assistant: {
            lastMessage: "done",
          },
          session: {
            stopHookActive: false,
          },
        },
        native: {
          hook_event_name: "Stop",
          last_assistant_message: "done",
          stop_hook_active: false,
        },
      },
      roots: [{ scope: "project", rootPath: projectRootPath }],
    });

    expect(report.handlers.map((handler) => handler.status)).toEqual(["allowed", "invalid-output"]);
    expect(report.aggregatedResult).toEqual({
      systemMessage: "run one more pass",
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("aggregate Hookify results preserves additional context alongside warnings and blocks", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-runtime-"));

  try {
    const projectRootPath = join(workspacePath, "project");

    await mkdir(join(projectRootPath, ".hookify", "user-prompt-submit"), {
      recursive: true,
    });

    await Bun.write(
      join(projectRootPath, ".hookify", "user-prompt-submit", "10-context.all.ts"),
      `console.log(JSON.stringify({ additionalContext: "Follow the repo policy." }));`,
    );
    await Bun.write(
      join(projectRootPath, ".hookify", "user-prompt-submit", "20-warning.all.ts"),
      `console.log(JSON.stringify({ systemMessage: "Heads up." }));`,
    );

    const report = await executeHookifyHandlers({
      envelope: {
        ...createEnvelope(projectRootPath),
        event: "user-prompt-submit",
        normalized: {
          prompt: {
            text: "Run the task.",
          },
        },
        native: {
          hook_event_name: "UserPromptSubmit",
          prompt: "Run the task.",
        },
      },
      roots: [{ scope: "project", rootPath: projectRootPath }],
    });

    expect(report.aggregatedResult).toEqual({
      additionalContext: "Follow the repo policy.",
      systemMessage: "Heads up.",
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
