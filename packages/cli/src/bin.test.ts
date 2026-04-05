import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const repoRootPath = join(import.meta.dir, "..", "..", "..");

test("hookify install codex runs through the npx-shaped cli entrypoint", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-cli-"));

  try {
    const homeDirectoryPath = join(workspacePath, "home");
    const hookifyHomePath = join(homeDirectoryPath, ".local", "share", "hookify");
    const codexHooksPath = join(homeDirectoryPath, ".codex", "hooks.json");
    const cliPath = join(import.meta.dir, "bin.ts");

    await mkdir(dirname(codexHooksPath), { recursive: true });
    await Bun.write(codexHooksPath, '{ "hooks": {} }\n');

    const childProcess = spawn("bun", [cliPath, "install", "codex"], {
      cwd: repoRootPath,
      env: {
        ...process.env,
        HOME: homeDirectoryPath,
        HOOKIFY_HOME: hookifyHomePath,
        HOOKIFY_REPO_DIR: repoRootPath,
        HOOKIFY_INSTALL_ACTOR: "cli-test",
        npm_execpath: "/opt/homebrew/bin/npx",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

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
    expect(stdout).toContain("Hookify for Codex installed.");
    expect(stdout).toContain("Plugin id: hookify@hookify-local");
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("hookify install auto-detects Codex and Claude and installs both", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-cli-"));

  try {
    const homeDirectoryPath = join(workspacePath, "home");
    const hookifyHomePath = join(homeDirectoryPath, ".local", "share", "hookify");
    const codexHooksPath = join(homeDirectoryPath, ".codex", "hooks.json");
    const claudeSettingsPath = join(homeDirectoryPath, ".claude", "settings.json");
    const cliPath = join(import.meta.dir, "bin.ts");

    await mkdir(dirname(codexHooksPath), { recursive: true });
    await mkdir(dirname(claudeSettingsPath), { recursive: true });
    await Bun.write(codexHooksPath, '{ "hooks": {} }\n');
    await Bun.write(claudeSettingsPath, '{ "enabledPlugins": {} }\n');

    const childProcess = spawn("bun", [cliPath, "install"], {
      cwd: repoRootPath,
      env: {
        ...process.env,
        HOME: homeDirectoryPath,
        HOOKIFY_HOME: hookifyHomePath,
        HOOKIFY_REPO_DIR: repoRootPath,
        HOOKIFY_INSTALL_ACTOR: "cli-test",
        npm_execpath: "/opt/homebrew/bin/npx",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

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
    expect(stdout).toContain("Hookify for Codex installed.");
    expect(stdout).toContain("Plugin id: hookify@hookify-local");
    expect(stdout).toContain("/plugin marketplace add jasonkuhrt/hookify");
    expect(stdout).toContain("/plugin install hookify-claude@hookify");
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
