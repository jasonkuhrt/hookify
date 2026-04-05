#!/usr/bin/env node

import {
  executeCodexHookify,
  parseCodexNativeEvent,
} from "../../../packages/integration-codex/src/index.ts";

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
