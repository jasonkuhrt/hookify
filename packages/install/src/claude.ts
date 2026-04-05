import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

export interface InstallHookifyClaudeOptions {
  /** Marketplace source to add. Defaults to `jasonkuhrt/hookify` (GitHub shorthand). */
  marketplaceSource?: string;
  /** Marketplace name as it appears after `plugin@`. Defaults to `hookify`. */
  marketplaceName?: string;
  /** Plugin name to install. Defaults to `hookify-claude`. */
  pluginName?: string;
  /** Installation scope passed to `claude plugin install --scope`. Defaults to `user`. */
  scope?: "user" | "project" | "local";
  /** Path to the `claude` binary. Defaults to `claude` looked up on PATH. */
  claudeBin?: string;
  /** PATH used for binary lookup when `claudeBin` is omitted. Defaults to `process.env.PATH`. */
  pathEnvironment?: string;
}

export interface InstallHookifyClaudeResult {
  installedPluginId: string;
  marketplaceSource: string;
  marketplaceName: string;
  scope: "user" | "project" | "local";
  claudeBin: string;
  marketplaceAddOutput: string;
  pluginInstallOutput: string;
}

export class HookifyClaudeNotFoundError extends Error {
  constructor(searchedFor: string) {
    super(
      `Could not find the \`${searchedFor}\` binary on PATH. Install Claude Code (https://claude.ai/code) and retry, or run the install manually: /plugin marketplace add jasonkuhrt/hookify && /plugin install hookify-claude@hookify`,
    );
    this.name = "HookifyClaudeNotFoundError";
  }
}

export class HookifyClaudeCliError extends Error {
  constructor(command: string, exitCode: number | null, stderr: string) {
    super(
      `\`claude ${command}\` exited with code ${exitCode ?? "unknown"}:\n${stderr.trim() || "(no stderr)"}`,
    );
    this.name = "HookifyClaudeCliError";
  }
}

export const installHookifyClaude = async (
  options: InstallHookifyClaudeOptions = {},
): Promise<InstallHookifyClaudeResult> => {
  const marketplaceSource = options.marketplaceSource ?? "jasonkuhrt/hookify";
  const marketplaceName = options.marketplaceName ?? "hookify";
  const pluginName = options.pluginName ?? "hookify-claude";
  const scope = options.scope ?? "user";
  const claudeBin = await resolveClaudeBinary(
    options.claudeBin,
    options.pathEnvironment ?? process.env.PATH ?? "",
  );

  const marketplaceAddOutput = await runClaude(
    claudeBin,
    ["plugin", "marketplace", "add", "--scope", scope, marketplaceSource],
    "plugin marketplace add",
  );
  const pluginInstallOutput = await runClaude(
    claudeBin,
    ["plugin", "install", "--scope", scope, `${pluginName}@${marketplaceName}`],
    "plugin install",
  );

  return {
    installedPluginId: `${pluginName}@${marketplaceName}`,
    marketplaceSource,
    marketplaceName,
    scope,
    claudeBin,
    marketplaceAddOutput,
    pluginInstallOutput,
  };
};

const resolveClaudeBinary = async (
  explicitBin: string | undefined,
  pathEnvironment: string,
): Promise<string> => {
  if (explicitBin !== undefined) {
    if (await isExecutable(explicitBin)) {
      return explicitBin;
    }

    throw new HookifyClaudeNotFoundError(explicitBin);
  }

  const searchPaths = pathEnvironment
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

  for (const searchPath of searchPaths) {
    const candidate = isAbsolute(searchPath) ? join(searchPath, "claude") : searchPath;

    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  throw new HookifyClaudeNotFoundError("claude");
};

const isExecutable = async (pathname: string): Promise<boolean> => {
  try {
    await access(pathname, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const runClaude = async (
  claudeBin: string,
  args: readonly string[],
  commandLabel: string,
): Promise<string> => {
  const child = spawn(claudeBin, [...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout.on("data", (chunk) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  child.stderr.on("data", (chunk) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");

  if (exitCode !== 0) {
    throw new HookifyClaudeCliError(commandLabel, exitCode, stderr);
  }

  return stdout;
};
