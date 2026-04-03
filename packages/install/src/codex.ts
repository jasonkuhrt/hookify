import { lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

import {
  renderCodexHooksJson,
  resolveHookifyInstallProvenance,
  writeCodexDispatcherSource,
} from "./index";

interface CodexHookCommand {
  type?: string;
  command?: unknown;
  [key: string]: unknown;
}

interface CodexHookMatcher {
  matcher?: string;
  hooks?: CodexHookCommand[];
  [key: string]: unknown;
}

interface CodexHooksJson {
  hooks?: Record<string, CodexHookMatcher[]>;
}

interface CodexMarketplacePlugin {
  name: string;
  source: {
    source: "local";
    path: string;
  };
  policy: {
    installation: "AVAILABLE";
    authentication: "ON_INSTALL";
  };
  category: string;
}

interface CodexMarketplaceFile {
  name: string;
  interface?: {
    displayName?: string;
    [key: string]: unknown;
  };
  plugins: CodexMarketplacePlugin[];
  [key: string]: unknown;
}

export interface InstallHookifyCodexOptions {
  homeDirectory?: string;
  hookifyHome?: string;
  repoPath?: string;
  installedVia?: string;
  installedBy?: string;
}

export interface InstallHookifyCodexResult {
  installedPluginId: string;
  generatedPluginPath: string;
  pluginLinkPath: string;
  generatedDispatcherPath: string;
  personalMarketplacePath: string;
  codexConfigPath: string;
  codexHooksPath: string;
}

export const installHookifyCodex = async (
  options: InstallHookifyCodexOptions = {},
): Promise<InstallHookifyCodexResult> => {
  const homeDirectory = resolve(options.homeDirectory ?? process.env.HOME ?? homedir());
  const hookifyHome = resolve(
    options.hookifyHome ??
      process.env.HOOKIFY_HOME ??
      join(homeDirectory, ".local", "share", "hookify"),
  );
  const repoPath = resolve(
    options.repoPath ?? process.env.HOOKIFY_REPO_DIR ?? join(hookifyHome, "repo"),
  );
  const generatedPluginPath = join(hookifyHome, "plugins", "hookify");
  const pluginLinkPath = join(homeDirectory, "plugins", "hookify");
  const personalMarketplacePath = join(homeDirectory, ".agents", "plugins", "marketplace.json");
  const codexConfigPath = join(homeDirectory, ".codex", "config.toml");
  const codexHooksPath = join(homeDirectory, ".codex", "hooks.json");
  const dispatcherPath = join(generatedPluginPath, "hooks", "dispatch-codex.ts");
  const repoIntegrationPath = join(repoPath, "packages", "integration-codex", "src", "index.ts");
  const repoSkillsPath = join(repoPath, "plugins", "hookify", "skills");
  const repoAgentsPath = join(repoPath, "plugins", "hookify", "agents");
  const repoPluginManifestPath = join(
    repoPath,
    "plugins",
    "hookify",
    ".codex-plugin",
    "plugin.json",
  );

  await assertPathExists(repoIntegrationPath, "Hookify Codex integration source");
  await assertPathExists(repoSkillsPath, "Hookify Codex skills directory");
  await assertPathExists(repoAgentsPath, "Hookify Codex agents directory");
  await assertPathExists(repoPluginManifestPath, "Hookify Codex plugin manifest");

  const provenance = resolveHookifyInstallProvenance({
    installSurface: "codex-plugin",
    installedVia:
      options.installedVia ?? process.env.HOOKIFY_INSTALLED_VIA ?? "script:install-codex.sh",
    ...(options.installedBy ? { installedBy: options.installedBy } : {}),
  });

  await mkdir(join(generatedPluginPath, ".codex-plugin"), { recursive: true });
  await mkdir(join(generatedPluginPath, "hooks"), { recursive: true });
  await mkdir(dirname(personalMarketplacePath), { recursive: true });
  await mkdir(dirname(codexConfigPath), { recursive: true });

  await writeCodexDispatcherSource({
    pathname: dispatcherPath,
    importPath: repoIntegrationPath,
    provenance,
  });
  await writeFile(
    join(generatedPluginPath, "hooks.json"),
    renderCodexHooksJson({
      command: "bun ./hooks/dispatch-codex.ts",
    }),
    "utf8",
  );
  await copyFile(repoPluginManifestPath, join(generatedPluginPath, ".codex-plugin", "plugin.json"));
  await replaceWithSymlink(repoSkillsPath, join(generatedPluginPath, "skills"));
  await replaceWithSymlink(repoAgentsPath, join(generatedPluginPath, "agents"));
  await replaceWithSymlink(generatedPluginPath, pluginLinkPath);

  const marketplaceName = await upsertCodexMarketplace(personalMarketplacePath);
  await ensureCodexConfig(codexConfigPath, marketplaceName);
  await removeLegacyHookifyCodexHooks(codexHooksPath);

  return {
    installedPluginId: `hookify@${marketplaceName}`,
    generatedPluginPath,
    pluginLinkPath,
    generatedDispatcherPath: dispatcherPath,
    personalMarketplacePath,
    codexConfigPath,
    codexHooksPath,
  };
};

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

const copyFile = async (sourcePath: string, destinationPath: string): Promise<void> => {
  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, await readFile(sourcePath, "utf8"), "utf8");
};

const upsertCodexMarketplace = async (pathname: string): Promise<string> => {
  const current = await readJsonFile<CodexMarketplaceFile>(pathname);
  const marketplace = current ?? {
    name: "hookify-local",
    interface: {
      displayName: "Hookify local",
    },
    plugins: [],
  };

  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const nextPlugin: CodexMarketplacePlugin = {
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
  };
  const nextPlugins = plugins.filter((plugin) => plugin?.name !== "hookify");
  nextPlugins.push(nextPlugin);

  const nextMarketplace: CodexMarketplaceFile = {
    ...marketplace,
    name:
      typeof marketplace.name === "string" && marketplace.name.trim() !== ""
        ? marketplace.name
        : "hookify-local",
    interface:
      marketplace.interface && typeof marketplace.interface === "object"
        ? marketplace.interface
        : { displayName: "Hookify local" },
    plugins: nextPlugins,
  };

  await writeJsonFile(pathname, nextMarketplace);

  return nextMarketplace.name;
};

const ensureCodexConfig = async (pathname: string, marketplaceName: string): Promise<void> => {
  const current = (await readOptionalTextFile(pathname)) ?? "";
  const withFeatures = upsertTomlAssignment(current, "[features]", "codex_hooks", "true");
  const pluginSection = `[plugins."hookify@${marketplaceName}"]`;
  const withPlugin = upsertTomlAssignment(withFeatures, pluginSection, "enabled", "true");

  await writeTextFile(pathname, withPlugin);
};

const removeLegacyHookifyCodexHooks = async (pathname: string): Promise<void> => {
  const current = await readJsonFile<CodexHooksJson>(pathname);

  if (!current) {
    return;
  }

  const nextHooksEntries = Object.entries(current.hooks ?? {})
    .map(([eventName, rules]) => {
      const nextRules = (Array.isArray(rules) ? rules : [])
        .map((rule) => {
          const nextCommands = (Array.isArray(rule?.hooks) ? rule.hooks : []).filter(
            (hook) => !isLegacyHookifyCodexCommand(hook.command),
          );

          if (nextCommands.length === 0) {
            return null;
          }

          return {
            ...rule,
            hooks: nextCommands,
          } satisfies CodexHookMatcher;
        })
        .filter((rule): rule is CodexHookMatcher => rule !== null);

      if (nextRules.length === 0) {
        return null;
      }

      return [eventName, nextRules] as const;
    })
    .filter((entry): entry is readonly [string, CodexHookMatcher[]] => entry !== null);

  await writeJsonFile(pathname, {
    ...current,
    hooks: Object.fromEntries(nextHooksEntries),
  });
};

const isLegacyHookifyCodexCommand = (command: unknown): boolean =>
  typeof command === "string" &&
  /hookify/i.test(command) &&
  /(dispatch-codex|(^|[\\/])hookify\.ts\b)/i.test(command);

const readJsonFile = async <T>(pathname: string): Promise<T | null> => {
  const text = await readOptionalTextFile(pathname);

  if (text === null) {
    return null;
  }

  return JSON.parse(text) as T;
};

const writeJsonFile = async (pathname: string, value: unknown): Promise<void> => {
  await writeTextFile(pathname, `${JSON.stringify(value, null, 2)}\n`);
};

const readOptionalTextFile = async (pathname: string): Promise<string | null> => {
  try {
    return await readFile(pathname, "utf8");
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
};

const writeTextFile = async (pathname: string, contents: string): Promise<void> => {
  await mkdir(dirname(pathname), { recursive: true });
  await writeFile(pathname, contents, "utf8");
};

const upsertTomlAssignment = (
  sourceText: string,
  sectionHeader: string,
  key: string,
  valueLiteral: string,
): string => {
  const normalized = sourceText;
  const sectionPattern = new RegExp(`^${escapeRegExp(sectionHeader)}$`, "m");
  const sectionMatch = sectionPattern.exec(normalized);

  if (!sectionMatch) {
    const trimmed = normalized.trimEnd();
    const separator = trimmed === "" ? "" : "\n\n";

    return `${trimmed}${separator}${sectionHeader}\n${key} = ${valueLiteral}\n`;
  }

  const sectionStart = sectionMatch.index;
  const headerStart = sectionStart;
  const headerEnd = normalized.indexOf("\n", headerStart);
  const bodyStart = headerEnd === -1 ? normalized.length : headerEnd + 1;
  const nextSectionOffset = normalized.slice(bodyStart).search(/^\[/m);
  const bodyEnd = nextSectionOffset === -1 ? normalized.length : bodyStart + nextSectionOffset;
  const sectionBody = normalized.slice(bodyStart, bodyEnd);
  const assignmentPattern = new RegExp(`^${escapeRegExp(key)}\\s*=.*$`, "m");

  if (assignmentPattern.test(sectionBody)) {
    return (
      normalized.slice(0, bodyStart) +
      sectionBody.replace(assignmentPattern, `${key} = ${valueLiteral}`) +
      normalized.slice(bodyEnd)
    );
  }

  return (
    normalized.slice(0, bodyStart) +
    `${key} = ${valueLiteral}\n` +
    sectionBody +
    normalized.slice(bodyEnd)
  );
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isMissingPathError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";
