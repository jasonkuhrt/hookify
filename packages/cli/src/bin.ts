#!/usr/bin/env bun

import { installHookifyCodex } from "@hookify/install/codex";
import { detectInstalledHookifyAgents } from "@hookify/install/detect";

type HookifyInstallTarget = "claude" | "codex";

const hookifyInstallTargets = [
  "codex",
  "claude",
] as const satisfies readonly HookifyInstallTarget[];

const main = async (): Promise<void> => {
  const [command, target, ...rest] = process.argv.slice(2);

  if (command === "install" && rest.length === 0) {
    const targets =
      target === undefined ? await detectInstallTargets() : [parseInstallTarget(target)];
    const outputSections: string[] = [];

    for (const installTarget of targets) {
      if (installTarget === "codex") {
        const result = await installHookifyCodex({
          installedVia: createInstalledViaLabel(
            target === undefined ? ["install"] : ["install", installTarget],
          ),
        });

        outputSections.push(
          [
            "Hookify for Codex installed.",
            `Plugin id: ${result.installedPluginId}`,
            `Generated plugin: ${result.generatedPluginPath}`,
            `Home plugin link: ${result.pluginLinkPath}`,
            `Generated dispatcher: ${result.generatedDispatcherPath}`,
            `Marketplace: ${result.personalMarketplacePath}`,
            `Codex config: ${result.codexConfigPath}`,
            `Codex hooks cleanup: ${result.codexHooksPath}`,
            "Restart Codex to pick up the plugin if it is already running.",
          ].join("\n"),
        );
        continue;
      }

      outputSections.push(
        [
          "Hookify for Claude installs via Claude Code's native plugin marketplace.",
          "",
          "Run these inside Claude Code:",
          "  /plugin marketplace add jasonkuhrt/hookify",
          "  /plugin install hookify-claude@hookify",
          "",
          "Then restart Claude Code.",
        ].join("\n"),
      );
    }

    process.stdout.write(`${outputSections.join("\n\n")}\n`);

    return;
  }

  process.stderr.write(
    ["Usage:", "  hookify install", "  hookify install codex", "  hookify install claude", ""].join(
      "\n",
    ),
  );
  process.exitCode = 1;
};

const detectInstallTargets = async (): Promise<HookifyInstallTarget[]> => {
  const detections = await detectInstalledHookifyAgents();
  const targets = detections
    .filter((detection) => detection.installed)
    .map((detection) => detection.agent);

  if (targets.length > 0) {
    return targets;
  }

  throw new Error(
    "No supported agent installation found. Hookify looked for Codex and Claude commands and home directories.",
  );
};

const parseInstallTarget = (target: string): HookifyInstallTarget => {
  if (isInstallTarget(target)) {
    return target;
  }

  throw new Error(`Unknown install target ${JSON.stringify(target)}.`);
};

const isInstallTarget = (target: string): target is HookifyInstallTarget =>
  (hookifyInstallTargets as readonly string[]).includes(target);

const createInstalledViaLabel = (commandParts: string[]): string => {
  const runner =
    process.env.npm_execpath || process.env.npm_lifecycle_event ? "npx:hookify" : "bunx:hookify";

  return `${runner} ${commandParts.join(" ")}`;
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`hookify cli failed: ${message}\n`);
    process.exitCode = 1;
  }
}
