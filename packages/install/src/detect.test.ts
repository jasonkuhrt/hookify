import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { detectInstalledHookifyAgents } from "./detect";

test("detectInstalledHookifyAgents finds Codex and Claude from commands and home surfaces", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-detect-"));

  try {
    const homeDirectoryPath = join(workspacePath, "home");
    const binDirectoryPath = join(workspacePath, "bin");
    const codexCommandPath = join(binDirectoryPath, "codex");

    await mkdir(join(homeDirectoryPath, ".claude"), { recursive: true });
    await mkdir(binDirectoryPath, { recursive: true });
    await writeFile(codexCommandPath, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(codexCommandPath, 0o755);
    await writeFile(join(homeDirectoryPath, ".claude", "settings.json"), "{}\n", "utf8");

    const detections = await detectInstalledHookifyAgents({
      homeDirectory: homeDirectoryPath,
      pathEnvironment: binDirectoryPath,
    });

    expect(detections).toEqual([
      {
        agent: "codex",
        installed: true,
        reasons: ["command:codex"],
      },
      {
        agent: "claude",
        installed: true,
        reasons: ["directory:~/.claude", "file:~/.claude/settings.json"],
      },
    ]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
