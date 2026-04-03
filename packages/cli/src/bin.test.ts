import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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

    const dispatcherSource = await readFile(
      join(hookifyHomePath, "plugins", "hookify", "hooks", "dispatch-codex.ts"),
      "utf8",
    );

    expect(dispatcherSource).toContain("// Installed via: npx:hookify install codex");
    expect(dispatcherSource).toContain("// Installed by: cli-test");
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
