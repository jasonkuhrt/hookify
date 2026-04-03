#!/usr/bin/env bun

import {
  executeCodexHookify,
  parseCodexNativeEvent,
} from "../../../packages/integration-codex/src/index.ts";

const readStandardInput = async (): Promise<string> =>
  await new Response(Bun.stdin.stream()).text();

const main = async (): Promise<void> => {
  const input = (await readStandardInput()).trim();

  if (input === "") {
    return;
  }

  const execution = await executeCodexHookify({
    native: parseCodexNativeEvent(input),
  });

  if (Object.keys(execution.output).length > 0) {
    process.stdout.write(`${JSON.stringify(execution.output)}\n`);
  }
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);

  process.stderr.write(`hookify codex dispatcher failed open: ${message}\n`);
}
