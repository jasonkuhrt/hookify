import { access, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";

import type { HookifyAgent } from "@hookify/schema";

export interface HookifyAgentDetection {
  agent: HookifyAgent;
  installed: boolean;
  reasons: string[];
}

export interface DetectHookifyAgentsOptions {
  homeDirectory?: string;
  pathEnvironment?: string;
}

export const detectInstalledHookifyAgents = async (
  options: DetectHookifyAgentsOptions = {},
): Promise<HookifyAgentDetection[]> => {
  const homeDirectory = resolve(options.homeDirectory ?? process.env.HOME ?? homedir());
  const pathEnvironment = options.pathEnvironment ?? process.env.PATH ?? "";

  const [codexCommand, claudeCommand, codexDirectory, claudeDirectory, claudeSettings] =
    await Promise.all([
      isCommandAvailable("codex", pathEnvironment),
      isCommandAvailable("claude", pathEnvironment),
      pathExists(join(homeDirectory, ".codex")),
      pathExists(join(homeDirectory, ".claude")),
      pathExists(join(homeDirectory, ".claude", "settings.json")),
    ]);

  return [
    {
      agent: "codex",
      installed: codexCommand || codexDirectory,
      reasons: [
        ...(codexCommand ? ["command:codex"] : []),
        ...(codexDirectory ? ["directory:~/.codex"] : []),
      ],
    },
    {
      agent: "claude",
      installed: claudeCommand || claudeDirectory || claudeSettings,
      reasons: [
        ...(claudeCommand ? ["command:claude"] : []),
        ...(claudeDirectory ? ["directory:~/.claude"] : []),
        ...(claudeSettings ? ["file:~/.claude/settings.json"] : []),
      ],
    },
  ];
};

const isCommandAvailable = async (
  commandName: string,
  pathEnvironment: string,
): Promise<boolean> => {
  const searchPaths = pathEnvironment
    .split(delimiter)
    .map((pathname) => pathname.trim())
    .filter((pathname) => pathname !== "");

  if (isAbsolute(commandName)) {
    return await isExecutablePath(commandName);
  }

  for (const searchPath of searchPaths) {
    if (await isExecutablePath(join(searchPath, commandName))) {
      return true;
    }
  }

  return false;
};

const isExecutablePath = async (pathname: string): Promise<boolean> => {
  try {
    await access(pathname, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const pathExists = async (pathname: string): Promise<boolean> => {
  try {
    await lstat(pathname);
    return true;
  } catch {
    return false;
  }
};
