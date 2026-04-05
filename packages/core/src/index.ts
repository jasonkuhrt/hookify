import { basename } from "node:path";

import type { HookifyAgent, HookifyApplicability, HookifyEnvelope } from "@hookify/schema";

export interface ParsedHookFileName {
  orderPrefix?: number;
  name: string;
  applicability: HookifyApplicability;
  runtime: string;
}

const HOOK_FILE_PATTERN =
  /^(?:(\d+)-)?(.+)\.(all|claude|codex)\.(ts|mts|cts|js|mjs|cjs|sh|bash|md)$/u;

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

export interface ParsedMarkdownHandler {
  frontmatter: Record<string, string | boolean>;
  body: string;
}

/**
 * Parse a declarative markdown hook handler.
 *
 * Recognizes YAML frontmatter delimited by `---` lines at the start of the file,
 * containing only flat `key: value` pairs (strings, booleans). The body is
 * everything after the closing delimiter.
 *
 * Files without frontmatter delimiters are treated as body-only (empty frontmatter).
 */
export const parseMarkdownHandler = (content: string): ParsedMarkdownHandler => {
  const normalized = content.replace(/^\uFEFF/u, "");
  const lines = normalized.split(/\r?\n/u);

  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, body: normalized.trim() };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");

  if (closingIndex === -1) {
    return { frontmatter: {}, body: normalized.trim() };
  }

  const frontmatterLines = lines.slice(1, closingIndex);
  const bodyLines = lines.slice(closingIndex + 1);

  return {
    frontmatter: parseFlatYaml(frontmatterLines),
    body: bodyLines.join("\n").trim(),
  };
};

const parseFlatYaml = (lines: readonly string[]): Record<string, string | boolean> => {
  const entries: Record<string, string | boolean> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (key === "") {
      continue;
    }

    entries[key] = coerceYamlScalar(rawValue);
  }

  return entries;
};

const coerceYamlScalar = (rawValue: string): string | boolean => {
  const withoutComment = stripInlineComment(rawValue).trim();

  if (withoutComment === "true") {
    return true;
  }

  if (withoutComment === "false") {
    return false;
  }

  return unquoteYamlString(withoutComment);
};

const stripInlineComment = (value: string): string => {
  if (value.startsWith('"') || value.startsWith("'")) {
    return value;
  }

  const commentIndex = value.indexOf(" #");

  return commentIndex === -1 ? value : value.slice(0, commentIndex);
};

const unquoteYamlString = (value: string): string => {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];

    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
};
