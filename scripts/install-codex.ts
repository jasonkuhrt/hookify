#!/usr/bin/env bun

import { installHookifyCodex } from "../packages/install/src/codex.ts";

const main = async (): Promise<void> => {
  const result = await installHookifyCodex();

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
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`hookify install-codex failed: ${message}\n`);
    process.exitCode = 1;
  }
}
