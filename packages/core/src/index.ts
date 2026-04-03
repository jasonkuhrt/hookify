import { basename } from "node:path";

import type { HookifyAgent, HookifyApplicability, HookifyEnvelope } from "@hookify/schema";

export interface ParsedHookFileName {
  orderPrefix?: number;
  name: string;
  applicability: HookifyApplicability;
  runtime: string;
}

const HOOK_FILE_PATTERN = /^(?:(\d+)-)?(.+)\.(all|claude|codex)\.(ts|mts|cts|js|mjs|cjs|sh|bash)$/u;

export const compareHookPathnames = (leftPathname: string, rightPathname: string): number =>
  leftPathname.localeCompare(rightPathname);

export const isEligibleApplicability = (
  agent: HookifyAgent,
  applicability: HookifyApplicability,
): boolean => applicability === "all" || applicability === agent;

export const parseHookFileName = (pathname: string): ParsedHookFileName | null => {
  const match = HOOK_FILE_PATTERN.exec(basename(pathname));

  if (!match) {
    return null;
  }

  const [, orderPrefixText, name, applicability, runtime] = match;

  return {
    ...(orderPrefixText ? { orderPrefix: Number.parseInt(orderPrefixText, 10) } : {}),
    name,
    applicability: applicability as HookifyApplicability,
    runtime,
  };
};

export const toHookEnvironment = (
  envelope: HookifyEnvelope,
  extras: Record<string, string | undefined> = {},
): Record<string, string> => {
  const entries = Object.entries({
    HOOKIFY_AGENT: envelope.agent,
    HOOKIFY_EVENT: envelope.event,
    HOOKIFY_SCOPE: envelope.scope,
    HOOKIFY_CWD: envelope.meta.cwd,
    HOOKIFY_PROJECT_ROOT: envelope.meta.projectRoot,
    HOOKIFY_GIT_ROOT: envelope.meta.gitRoot,
    HOOKIFY_SESSION_ID: envelope.meta.sessionId,
    HOOKIFY_TURN_ID: envelope.meta.turnId,
    HOOKIFY_TRANSCRIPT_PATH: envelope.meta.transcriptPath,
    HOOKIFY_FORMAT: `hookify.v${envelope.version}`,
    ...extras,
  }).filter(([, value]) => value !== undefined);

  return Object.fromEntries(entries);
};
