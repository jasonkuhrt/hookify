import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { executeCodexHookify } from "./index";

test("executeCodexHookify resolves roots, executes handlers, and returns Codex output", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-codex-"));

  try {
    const homeDirectoryPath = join(workspacePath, "home");
    const projectRootPath = join(workspacePath, "repo");

    await mkdir(join(homeDirectoryPath, ".hookify", "pre-tool-use"), { recursive: true });
    await mkdir(join(projectRootPath, ".git"), { recursive: true });
    await mkdir(join(projectRootPath, ".hookify", "pre-tool-use"), { recursive: true });
    const resolvedHomeDirectoryPath = await realpath(homeDirectoryPath);
    const resolvedProjectRootPath = await realpath(projectRootPath);

    await Bun.write(
      join(homeDirectoryPath, ".hookify", "pre-tool-use", "10-explain.all.ts"),
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
        'if grep -q "cmux" "$HOOKIFY_ENVELOPE_PATH"; then',
        '  echo "cmux is forbidden" >&2',
        "  exit 2",
        "fi",
      ].join("\n"),
    );

    const execution = await executeCodexHookify({
      homeDirectory: homeDirectoryPath,
      native: {
        cwd: projectRootPath,
        hook_event_name: "PreToolUse",
        model: "gpt-5.4",
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

    expect(execution.context).toEqual({
      cwd: resolvedProjectRootPath,
      projectRoot: resolvedProjectRootPath,
      gitRoot: resolvedProjectRootPath,
      roots: [
        {
          scope: "user",
          rootPath: resolvedHomeDirectoryPath,
        },
        {
          scope: "project",
          rootPath: resolvedProjectRootPath,
        },
      ],
    });
    expect(execution.report.handlers.map((handler) => handler.status)).toEqual([
      "allowed",
      "blocked",
    ]);
    expect(execution.output).toEqual({
      decision: "block",
      reason: "cmux is forbidden",
      systemMessage: "user:cmux list-workspaces",
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
