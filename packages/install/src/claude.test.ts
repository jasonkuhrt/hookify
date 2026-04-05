import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { HookifyClaudeCliError, HookifyClaudeNotFoundError, installHookifyClaude } from "./claude";

const writeFakeClaudeBinary = async (
  directoryPath: string,
  scriptBody: string,
): Promise<string> => {
  const binaryPath = join(directoryPath, "claude");

  await writeFile(binaryPath, ["#!/usr/bin/env bash", "set -euo pipefail", scriptBody].join("\n"));
  await chmod(binaryPath, 0o755);

  return binaryPath;
};

test("installHookifyClaude drives `claude plugin marketplace add` and `claude plugin install`", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-claude-install-"));

  try {
    const callLogPath = join(workspacePath, "calls.log");
    const binaryPath = await writeFakeClaudeBinary(
      workspacePath,
      `printf '%s\\n' "$*" >> "${callLogPath}"`,
    );

    const result = await installHookifyClaude({ claudeBin: binaryPath });

    expect(result).toEqual({
      installedPluginId: "hookify-claude@hookify",
      marketplaceSource: "jasonkuhrt/hookify",
      marketplaceName: "hookify",
      scope: "user",
      claudeBin: binaryPath,
      marketplaceAddOutput: "",
      pluginInstallOutput: "",
    });

    const calls = (await readFile(callLogPath, "utf8")).trim().split("\n");

    expect(calls).toEqual([
      "plugin marketplace add --scope user jasonkuhrt/hookify",
      "plugin install --scope user hookify-claude@hookify",
    ]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("installHookifyClaude honors custom source, marketplace name, and scope", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-claude-install-"));

  try {
    const callLogPath = join(workspacePath, "calls.log");
    const binaryPath = await writeFakeClaudeBinary(
      workspacePath,
      `printf '%s\\n' "$*" >> "${callLogPath}"`,
    );

    const result = await installHookifyClaude({
      claudeBin: binaryPath,
      marketplaceSource: "/path/to/local/checkout",
      marketplaceName: "hookify-dev",
      pluginName: "hookify-claude",
      scope: "project",
    });

    expect(result.installedPluginId).toBe("hookify-claude@hookify-dev");
    expect(result.scope).toBe("project");

    const calls = (await readFile(callLogPath, "utf8")).trim().split("\n");

    expect(calls).toEqual([
      "plugin marketplace add --scope project /path/to/local/checkout",
      "plugin install --scope project hookify-claude@hookify-dev",
    ]);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("installHookifyClaude throws HookifyClaudeNotFoundError when claude is not on PATH", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-claude-install-"));

  try {
    await expect(installHookifyClaude({ pathEnvironment: workspacePath })).rejects.toBeInstanceOf(
      HookifyClaudeNotFoundError,
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test("installHookifyClaude surfaces CLI failure output as HookifyClaudeCliError", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "hookify-claude-install-"));

  try {
    const binaryPath = await writeFakeClaudeBinary(
      workspacePath,
      ['printf "something went wrong\\n" >&2', "exit 3"].join("\n"),
    );

    await expect(installHookifyClaude({ claudeBin: binaryPath })).rejects.toBeInstanceOf(
      HookifyClaudeCliError,
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
