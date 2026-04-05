#!/usr/bin/env node

import {
  executeClaudeHookify,
  parseClaudeNativeEvent,
} from "../../../packages/integration-claude/src/index.ts";

const readStandardInput = async (): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

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
