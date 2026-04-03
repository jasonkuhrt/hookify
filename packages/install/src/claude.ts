import { lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

import {
  renderClaudeDispatcherSource,
  renderClaudeHooksJson,
  resolveHookifyInstallProvenance,
} from "./index";

interface ClaudeSettingsJson {
  enabledPlugins?: Record<string, boolean>;
  extraKnownMarketplaces?: Record<string, ClaudeMarketplaceReference>;
  [key: string]: unknown;
}

interface ClaudeMarketplaceReference {
  source: {
    source: "directory";
    path: string;
  };
  autoUpdate?: boolean;
}

interface ClaudeMarketplaceManifest {
  name: string;
  metadata: {
    description: string;
  };
  owner: {
    name: string;
    email: string;
  };
  plugins: Array<{
    name: string;
    source: string;
    description: string;
  }>;
}

export interface InstallHookifyClaudeOptions {
  homeDirectory?: string;
  hookifyHome?: string;
  repoPath?: string;
  installedVia?: string;
  installedBy?: string;
}

export interface InstallHookifyClaudeResult {
  installedPluginId: string;
  generatedMarketplacePath: string;
  generatedPluginPath: string;
  generatedDispatcherPath: string;
  claudeSettingsPath: string;
}

export const installHookifyClaude = async (
  options: InstallHookifyClaudeOptions = {},
): Promise<InstallHookifyClaudeResult> => {
  const homeDirectory = resolve(options.homeDirectory ?? process.env.HOME ?? homedir());
  const hookifyHome = resolve(
    options.hookifyHome ??
      process.env.HOOKIFY_HOME ??
      join(homeDirectory, ".local", "share", "hookify"),
  );
  const repoPath = resolve(
    options.repoPath ?? process.env.HOOKIFY_REPO_DIR ?? join(hookifyHome, "repo"),
  );
  const generatedMarketplacePath = join(hookifyHome, "claude-marketplace");
  const generatedPluginPath = join(generatedMarketplacePath, "plugins", "hookify");
  const generatedDispatcherPath = join(generatedPluginPath, "hooks", "dispatch-claude.ts");
  const claudeSettingsPath = join(homeDirectory, ".claude", "settings.json");
  const repoDispatcherImportPath = join(
    repoPath,
    "packages",
    "integration-claude",
    "src",
    "index.ts",
  );
  const repoSkillsPath = join(repoPath, "plugins", "hookify", "skills");
  const repoPluginManifestPath = join(
    repoPath,
    "plugins",
    "hookify-claude",
    ".claude-plugin",
    "plugin.json",
  );

  await assertPathExists(repoDispatcherImportPath, "Hookify Claude integration source");
  await assertPathExists(repoSkillsPath, "Hookify shared skills directory");
  await assertPathExists(repoPluginManifestPath, "Hookify Claude plugin manifest");

  const provenance = resolveHookifyInstallProvenance({
    installSurface: "claude-plugin",
    installedVia:
      options.installedVia ?? process.env.HOOKIFY_INSTALLED_VIA ?? "script:install-claude.sh",
    ...(options.installedBy ? { installedBy: options.installedBy } : {}),
  });

  await mkdir(join(generatedMarketplacePath, ".claude-plugin"), { recursive: true });
  await mkdir(join(generatedPluginPath, ".claude-plugin"), { recursive: true });
  await mkdir(join(generatedPluginPath, "hooks"), { recursive: true });

  await writeTextFile(
    join(generatedMarketplacePath, ".claude-plugin", "marketplace.json"),
    `${JSON.stringify(createClaudeMarketplaceManifest(), null, 2)}\n`,
  );
  await writeTextFile(
    join(generatedPluginPath, ".claude-plugin", "plugin.json"),
    await readFile(repoPluginManifestPath, "utf8"),
  );
  await writeTextFile(
    join(generatedPluginPath, "hooks", "dispatch-claude.ts"),
    renderClaudeDispatcherSource({
      importPath: repoDispatcherImportPath,
      provenance,
    }),
  );
  await writeTextFile(
    join(generatedPluginPath, "hooks", "hooks.json"),
    renderClaudeHooksJson({
      command: "bun ${CLAUDE_PLUGIN_ROOT}/hooks/dispatch-claude.ts",
      timeoutSeconds: 10,
      description: "Hookify Claude plugin",
    }),
  );
  await replaceWithSymlink(repoSkillsPath, join(generatedPluginPath, "skills"));

  const settings = (await readJsonFile<ClaudeSettingsJson>(claudeSettingsPath)) ?? {};
  const nextSettings: ClaudeSettingsJson = {
    ...settings,
    enabledPlugins: {
      ...settings.enabledPlugins,
      "hookify@hookify-local": true,
      "hookify@claude-plugins-official": false,
    },
    extraKnownMarketplaces: {
      ...settings.extraKnownMarketplaces,
      "hookify-local": {
        source: {
          source: "directory",
          path: generatedMarketplacePath,
        },
        autoUpdate: true,
      },
    },
  };

  await writeJsonFile(claudeSettingsPath, nextSettings);

  return {
    installedPluginId: "hookify@hookify-local",
    generatedMarketplacePath,
    generatedPluginPath,
    generatedDispatcherPath,
    claudeSettingsPath,
  };
};

const createClaudeMarketplaceManifest = (): ClaudeMarketplaceManifest => ({
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

const assertPathExists = async (pathname: string, label: string): Promise<void> => {
  try {
    await lstat(pathname);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} not found at ${pathname}: ${reason}`);
  }
};

const replaceWithSymlink = async (targetPath: string, linkPath: string): Promise<void> => {
  await rm(linkPath, { recursive: true, force: true });
  await mkdir(dirname(linkPath), { recursive: true });
  await symlink(targetPath, linkPath, "dir");
};

const readJsonFile = async <T>(pathname: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(pathname, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
};

const writeJsonFile = async (pathname: string, value: unknown): Promise<void> => {
  await writeTextFile(pathname, `${JSON.stringify(value, null, 2)}\n`);
};

const writeTextFile = async (pathname: string, contents: string): Promise<void> => {
  await mkdir(dirname(pathname), { recursive: true });
  await writeFile(pathname, contents, "utf8");
};
