import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { executeClaudeHookify } from "./index";

test("executeClaudeHookify resolves roots, executes handlers, and returns Claude output", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-claude-"));

  try {
    const homeDirectoryPath = join(workspacePath, "home");
    const projectRootPath = join(workspacePath, "repo");

    await mkdir(join(homeDirectoryPath, ".hookify", "pre-tool-use"), { recursive: true });
    await mkdir(join(projectRootPath, ".git"), { recursive: true });
    await mkdir(join(projectRootPath, ".hookify", "pre-tool-use"), { recursive: true });

    await Bun.write(
      join(homeDirectoryPath, ".hookify", "pre-tool-use", "10-explain.all.ts"),
      [
        "console.log(JSON.stringify({",
        "  additionalContext: `${process.env.HOOKIFY_SCOPE} policy`",
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

    const execution = await executeClaudeHookify({
      homeDirectory: homeDirectoryPath,
      native: {
        cwd: projectRootPath,
        hook_event_name: "PreToolUse",
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

    expect(execution.report.handlers.map((handler) => handler.status)).toEqual([
      "allowed",
      "blocked",
    ]);
    expect(execution.output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "cmux is forbidden",
        additionalContext: "user policy",
      },
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
