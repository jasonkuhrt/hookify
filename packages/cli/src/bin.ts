#!/usr/bin/env bun

import { installHookifyCodex } from "@hookify/install/codex";

const main = async (): Promise<void> => {
  const [command, target] = process.argv.slice(2);

  if (command === "install" && target === "codex") {
    const result = await installHookifyCodex({
      installedVia:
        process.env.npm_execpath || process.env.npm_lifecycle_event
          ? "npx:hookify install codex"
          : "bunx:hookify install codex",
    });

    process.stdout.write(
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
        "",
      ].join("\n"),
    );

    return;
  }

  process.stderr.write(["Usage:", "  hookify install codex", ""].join("\n"));
  process.exitCode = 1;
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
