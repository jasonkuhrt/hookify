import { expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const repoRootPath = join(import.meta.dir, "..");

test("install-codex symlinks the repo plugin and cleans legacy user hooks", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-install-codex-"));

  try {
    const homeDirectoryPath = join(workspacePath, "home");
    const codexHooksPath = join(homeDirectoryPath, ".codex", "hooks.json");
    const codexConfigPath = join(homeDirectoryPath, ".codex", "config.toml");
    const marketplacePath = join(homeDirectoryPath, ".agents", "plugins", "marketplace.json");
    const pluginLinkPath = join(homeDirectoryPath, "plugins", "hookify");
    const installScriptPath = join(import.meta.dir, "install-codex.ts");

    await mkdir(dirname(codexHooksPath), { recursive: true });
    await mkdir(dirname(marketplacePath), { recursive: true });
    await Bun.write(
      codexHooksPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  {
                    type: "command",
                    command: "bun ~/.codex/hooks/hookify.ts",
                  },
                  {
                    type: "command",
                    command: "bun ~/.codex/hooks/keep-me.ts",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    );
    await Bun.write(codexConfigPath, 'model = "gpt-5.4"\n');

    const childProcess = spawn("bun", [installScriptPath], {
      cwd: repoRootPath,
      env: {
        ...process.env,
        HOME: homeDirectoryPath,
        HOOKIFY_REPO_DIR: repoRootPath,
        HOOKIFY_INSTALL_ACTOR: "test-runner",
        HOOKIFY_INSTALLED_VIA: "test:install-codex",
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

    const [configText, marketplaceText, cleanedHooksText, pluginLinkMetadata] = await Promise.all([
      readFile(codexConfigPath, "utf8"),
      readFile(marketplacePath, "utf8"),
      readFile(codexHooksPath, "utf8"),
      lstat(pluginLinkPath),
    ]);

    expect(configText).toContain("[features]");
    expect(configText).toContain("codex_hooks = true");
    expect(configText).toContain('[plugins."hookify@hookify-local"]');
    expect(configText).toContain("enabled = true");
    expect(JSON.parse(marketplaceText)).toEqual({
      name: "hookify-local",
      interface: {
        displayName: "Hookify local",
      },
      plugins: [
        {
          name: "hookify",
          source: {
            source: "local",
            path: "./plugins/hookify",
          },
          policy: {
            installation: "AVAILABLE",
            authentication: "ON_INSTALL",
          },
          category: "Productivity",
        },
      ],
    });
    expect(JSON.parse(cleanedHooksText)).toEqual({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: "bun ~/.codex/hooks/keep-me.ts",
              },
            ],
          },
        ],
      },
    });
    expect(pluginLinkMetadata.isSymbolicLink()).toBe(true);
    expect(await realpath(pluginLinkPath)).toBe(
      await realpath(join(repoRootPath, "plugins", "hookify")),
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
