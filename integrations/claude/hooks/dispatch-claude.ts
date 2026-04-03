#!/usr/bin/env bun

import {
  executeClaudeHookify,
  parseClaudeNativeEvent,
} from "../../../packages/integration-claude/src/index.ts";

const readStandardInput = async (): Promise<string> =>
  await new Response(Bun.stdin.stream()).text();

const main = async (): Promise<void> => {
  const input = (await readStandardInput()).trim();

  if (input === "") {
    return;
  }

  const execution = await executeClaudeHookify({
    native: parseClaudeNativeEvent(input),
  });

  if (Object.keys(execution.output).length > 0) {
    process.stdout.write(`${JSON.stringify(execution.output)}\n`);
  }
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);

  process.stderr.write(`hookify claude dispatcher failed open: ${message}\n`);
}
