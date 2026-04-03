import { expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { installHookifyClaude } from "./claude";

const repoRootPath = join(import.meta.dir, "..", "..", "..");

test("installHookifyClaude creates a local marketplace and enables the local plugin", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-install-claude-"));

  try {
    const homeDirectoryPath = join(workspacePath, "home");
    const hookifyHomePath = join(homeDirectoryPath, ".local", "share", "hookify");
    const claudeSettingsPath = join(homeDirectoryPath, ".claude", "settings.json");

    await mkdir(dirname(claudeSettingsPath), { recursive: true });
    await writeFile(
      claudeSettingsPath,
      JSON.stringify(
        {
          enabledPlugins: {
            "hookify@claude-plugins-official": true,
            "other@marketplace": true,
          },
          extraKnownMarketplaces: {
            "existing-marketplace": {
              source: {
                source: "directory",
                path: "/tmp/existing-marketplace",
              },
              autoUpdate: true,
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await installHookifyClaude({
      homeDirectory: homeDirectoryPath,
      hookifyHome: hookifyHomePath,
      repoPath: repoRootPath,
      installedVia: "test:install-claude",
      installedBy: "test-runner",
    });

    expect(result.installedPluginId).toBe("hookify@hookify-local");

    const marketplacePath = join(hookifyHomePath, "claude-marketplace");
    const pluginPath = join(marketplacePath, "plugins", "hookify");
    const dispatcherPath = join(pluginPath, "hooks", "dispatch-claude.ts");
    const skillsPath = join(pluginPath, "skills");

    const [marketplaceJson, pluginJson, hooksJson, dispatcherSource, settingsText, skillsMetadata] =
      await Promise.all([
        readFile(join(marketplacePath, ".claude-plugin", "marketplace.json"), "utf8"),
        readFile(join(pluginPath, ".claude-plugin", "plugin.json"), "utf8"),
        readFile(join(pluginPath, "hooks", "hooks.json"), "utf8"),
        readFile(dispatcherPath, "utf8"),
        readFile(claudeSettingsPath, "utf8"),
        lstat(skillsPath),
      ]);

    expect(JSON.parse(marketplaceJson)).toEqual({
      name: "hookify-local",
      metadata: {
        description: "Hookify local marketplace.",
      },
      owner: {
        name: "Hookify",
        email: "opensource@hookify.dev",
      },
      plugins: [
        {
          name: "hookify",
          source: "./plugins/hookify",
          description: "Hookify skills and hooks for Claude Code.",
        },
      ],
    });
    expect(JSON.parse(pluginJson).name).toBe("hookify");
    expect(JSON.parse(hooksJson).description).toBe("Hookify Claude plugin");
    expect(dispatcherSource).toContain("// Install surface: claude-plugin");
    expect(dispatcherSource).toContain("// Installed via: test:install-claude");
    expect(dispatcherSource).toContain("// Installed by: test-runner");
    expect(skillsMetadata.isSymbolicLink()).toBe(true);
    expect(await realpath(skillsPath)).toBe(
      await realpath(join(repoRootPath, "plugins", "hookify", "skills")),
    );
    expect(JSON.parse(settingsText)).toEqual({
      enabledPlugins: {
        "hookify@claude-plugins-official": false,
        "other@marketplace": true,
        "hookify@hookify-local": true,
      },
      extraKnownMarketplaces: {
        "existing-marketplace": {
          source: {
            source: "directory",
            path: "/tmp/existing-marketplace",
          },
          autoUpdate: true,
        },
        "hookify-local": {
          source: {
            source: "directory",
            path: marketplacePath,
          },
          autoUpdate: true,
        },
      },
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
