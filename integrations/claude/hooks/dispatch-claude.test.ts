import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("dispatch-claude executes the Claude-facing path end to end", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-claude-plugin-"));

  try {
    const homeDirectoryPath = join(workspacePath, "home");
    const projectRootPath = join(workspacePath, "repo");
    const dispatcherPath = join(import.meta.dir, "dispatch-claude.ts");

    await mkdir(join(homeDirectoryPath, ".hookify", "pre-tool-use"), { recursive: true });
    await mkdir(join(projectRootPath, ".git"), { recursive: true });
    await mkdir(join(projectRootPath, ".hookify", "pre-tool-use"), { recursive: true });

    await Bun.write(
      join(homeDirectoryPath, ".hookify", "pre-tool-use", "10-warn.all.ts"),
      `console.log(JSON.stringify({ additionalContext: "user policy" }));`,
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

    const childProcess = spawn("bun", [dispatcherPath], {
      env: {
        ...process.env,
        HOME: homeDirectoryPath,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    childProcess.stdin.end(
      JSON.stringify({
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
      }),
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    childProcess.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    childProcess.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      childProcess.once("error", reject);
      childProcess.once("close", resolve);
    });
    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const stderr = Buffer.concat(stderrChunks).toString("utf8");

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
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
