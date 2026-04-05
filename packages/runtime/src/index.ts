import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";

import {
  parseHookFileName,
  parseMarkdownHandler,
  toHookEnvironment,
  type ParsedHookFileName,
} from "@hookify/core";
import {
  HOOKIFY_ENVELOPE_VERSION,
  type HookifyEnvelope,
  type HookifyResult,
  type HookifyScope,
} from "@hookify/schema";

export const HOOKIFY_DIRECTORY_NAME = ".hookify" as const;
export const HOOKIFY_DEFAULT_TIMEOUT_MS = 600_000;

export interface HookifyExecutionRoot {
  scope: HookifyScope;
  rootPath: string;
}

export interface HookifyRuntimeContext {
  cwd: string;
  projectRoot: string;
  gitRoot?: string;
  roots: HookifyExecutionRoot[];
}

export interface HookifyDiscoveredHandler<Native = unknown> extends ParsedHookFileName {
  pathname: string;
  realpath: string;
  rootPath: string;
  eventDirectoryPath: string;
  scope: HookifyScope;
  envelope: HookifyEnvelope<Native>;
}

export type HookifyHandlerStatus =
  | "allowed"
  | "blocked"
  | "failed"
  | "invalid-output"
  | "timed-out";

export interface HookifyExecutedHandler<Native = unknown> {
  handler: HookifyDiscoveredHandler<Native>;
  exitCode: number | null;
  status: HookifyHandlerStatus;
  stdout: string;
  stderr: string;
  result: HookifyResult;
  diagnostics?: string;
}

export interface HookifyExecutionReport<Native = unknown> {
  handlers: HookifyExecutedHandler<Native>[];
  aggregatedResult: HookifyResult;
}

export interface DiscoverHookifyHandlersOptions<Native = unknown> {
  envelope: HookifyEnvelope<Native>;
  roots: readonly HookifyExecutionRoot[];
}

export interface ExecuteHookifyHandlersOptions<
  Native = unknown,
> extends DiscoverHookifyHandlersOptions<Native> {
  timeoutMs?: number;
}

export interface ResolveHookifyRuntimeContextOptions {
  cwd: string;
  homeDirectory?: string;
  projectRoot?: string;
  gitRoot?: string;
}

export const discoverHookifyHandlers = async <Native = unknown>(
  options: DiscoverHookifyHandlersOptions<Native>,
): Promise<HookifyDiscoveredHandler<Native>[]> => {
  const handlers: HookifyDiscoveredHandler<Native>[] = [];
  const seenRealpaths = new Set<string>();

  for (const root of options.roots) {
    const eventDirectoryPath = join(root.rootPath, HOOKIFY_DIRECTORY_NAME, options.envelope.event);
    const entries = await readDirectoryEntries(eventDirectoryPath);
    const rootHandlers: HookifyDiscoveredHandler<Native>[] = [];

    for (const entry of entries) {
      const pathname = join(eventDirectoryPath, entry.name);
      const parsed = parseHookFileName(pathname);

      if (!parsed) {
        continue;
      }

      if (parsed.applicability !== "all" && parsed.applicability !== options.envelope.agent) {
        continue;
      }

      const resolvedRealpath = await resolvePathname(pathname);

      if (seenRealpaths.has(resolvedRealpath)) {
        continue;
      }

      seenRealpaths.add(resolvedRealpath);

      rootHandlers.push({
        ...parsed,
        pathname,
        realpath: resolvedRealpath,
        rootPath: root.rootPath,
        eventDirectoryPath,
        scope: root.scope,
        envelope: withScope(options.envelope, root.scope),
      });
    }

    handlers.push(...rootHandlers.sort(compareHookifyHandlersWithinRoot));
  }

  return handlers;
};

export const executeHookifyHandlers = async <Native = unknown>(
  options: ExecuteHookifyHandlersOptions<Native>,
): Promise<HookifyExecutionReport<Native>> => {
  const handlers = await discoverHookifyHandlers(options);
  const timeoutMs = options.timeoutMs ?? HOOKIFY_DEFAULT_TIMEOUT_MS;
  const executedHandlers = await Promise.all(
    handlers.map((handler) => executeHookifyHandler(handler, timeoutMs)),
  );

  return {
    handlers: executedHandlers,
    aggregatedResult: aggregateHookifyResults(executedHandlers),
  };
};

export const aggregateHookifyResults = (
  executedHandlers: readonly HookifyExecutedHandler[],
): HookifyResult => {
  const blockReasons = uniqueNonEmptyStrings(
    executedHandlers.flatMap((handler) =>
      handler.result.decision === "block" ? [handler.result.reason] : [],
    ),
  );
  const systemMessages = uniqueNonEmptyStrings(
    executedHandlers.flatMap((handler) =>
      handler.result.systemMessage ? [handler.result.systemMessage] : [],
    ),
  );
  const additionalContexts = uniqueNonEmptyStrings(
    executedHandlers.flatMap((handler) =>
      handler.result.additionalContext ? [handler.result.additionalContext] : [],
    ),
  );

  if (blockReasons.length > 0) {
    return {
      decision: "block",
      reason: blockReasons.join("\n\n"),
      ...(additionalContexts.length > 0
        ? { additionalContext: additionalContexts.join("\n\n") }
        : {}),
      ...(systemMessages.length > 0 ? { systemMessage: systemMessages.join("\n\n") } : {}),
    };
  }

  return {
    ...(additionalContexts.length > 0
      ? { additionalContext: additionalContexts.join("\n\n") }
      : {}),
    ...(systemMessages.length > 0 ? { systemMessage: systemMessages.join("\n\n") } : {}),
  };
};

export const withScope = <Native>(
  envelope: HookifyEnvelope<Native>,
  scope: HookifyScope,
): HookifyEnvelope<Native> => ({
  ...envelope,
  version: HOOKIFY_ENVELOPE_VERSION,
  scope,
});

export const resolveHookifyRuntimeContext = async (
  options: ResolveHookifyRuntimeContextOptions,
): Promise<HookifyRuntimeContext> => {
  const cwd = await resolveDirectoryPathIfPossible(options.cwd);
  const homeDirectory = options.homeDirectory
    ? await resolveDirectoryPathIfPossible(options.homeDirectory)
    : defaultHomeDirectory();
  const gitRoot =
    options.gitRoot !== undefined
      ? await resolveDirectoryPathIfPossible(options.gitRoot)
      : await findGitRoot(cwd);
  const boundaryRoot =
    options.projectRoot !== undefined
      ? await resolveDirectoryPathIfPossible(options.projectRoot)
      : (gitRoot ?? cwd);
  const ancestors = collectAncestorPaths(cwd, boundaryRoot);
  const discoveredProjectRoots = await filterHookifyRoots(ancestors);
  const projectRoot = discoveredProjectRoots.at(-1)?.rootPath ?? boundaryRoot;

  return {
    cwd,
    projectRoot,
    ...(gitRoot ? { gitRoot } : {}),
    roots: [
      ...(homeDirectory
        ? [{ scope: "user", rootPath: homeDirectory } satisfies HookifyExecutionRoot]
        : []),
      ...(discoveredProjectRoots.length > 0
        ? discoveredProjectRoots
        : [{ scope: "project", rootPath: boundaryRoot } satisfies HookifyExecutionRoot]),
    ],
  };
};

const executeHookifyHandler = async <Native>(
  handler: HookifyDiscoveredHandler<Native>,
  timeoutMs: number,
): Promise<HookifyExecutedHandler<Native>> => {
  if (handler.runtime === "md") {
    return executeMarkdownHandler(handler);
  }

  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "hookify-"));

  try {
    const envelopePath = join(temporaryDirectoryPath, "envelope.json");
    const nativePath = join(temporaryDirectoryPath, "native.json");
    const normalizedPath = join(temporaryDirectoryPath, "normalized.json");

    await Promise.all([
      writeJsonFile(envelopePath, handler.envelope),
      writeJsonFile(nativePath, handler.envelope.native),
      writeJsonFile(normalizedPath, handler.envelope.normalized),
    ]);

    const environment = {
      ...process.env,
      ...toHookEnvironment(handler.envelope, {
        HOOKIFY_ENVELOPE_PATH: envelopePath,
        HOOKIFY_NATIVE_PATH: nativePath,
        HOOKIFY_NORMALIZED_PATH: normalizedPath,
        HOOKIFY_HANDLER_NAME: handler.name,
        HOOKIFY_HANDLER_PATH: handler.pathname,
        HOOKIFY_HANDLER_REALPATH: handler.realpath,
        HOOKIFY_HANDLER_APPLICABILITY: handler.applicability,
        HOOKIFY_HANDLER_RUNTIME: handler.runtime,
      }),
    };

    const execution = await spawnHookifyProcess(handler, {
      timeoutMs,
      environment,
      stdin: JSON.stringify(handler.envelope),
    });

    return interpretHookifyExecution(handler, execution);
  } finally {
    await rm(temporaryDirectoryPath, { recursive: true, force: true });
  }
};

interface SpawnHookifyProcessOptions {
  timeoutMs: number;
  environment: NodeJS.ProcessEnv;
  stdin: string;
}

interface SpawnHookifyProcessResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

const spawnHookifyProcess = async (
  handler: HookifyDiscoveredHandler,
  options: SpawnHookifyProcessOptions,
): Promise<SpawnHookifyProcessResult> => {
  const command = toProcessCommand(handler);
  const child = spawn(command.file, command.args, {
    cwd: handler.envelope.meta.cwd,
    env: options.environment,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let timedOut = false;

  child.stdout.on("data", (chunk) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  child.stderr.on("data", (chunk) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  child.stdin.end(options.stdin);

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, options.timeoutMs);

  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });

    return {
      exitCode,
      timedOut,
      stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      stderr: Buffer.concat(stderrChunks).toString("utf8"),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const MARKDOWN_EMIT_FIELDS = ["systemMessage", "additionalContext", "reason"] as const;
type MarkdownEmitField = (typeof MARKDOWN_EMIT_FIELDS)[number];

const executeMarkdownHandler = async <Native>(
  handler: HookifyDiscoveredHandler<Native>,
): Promise<HookifyExecutedHandler<Native>> => {
  let content: string;

  try {
    content = await readFile(handler.realpath, "utf8");
  } catch (error) {
    return {
      handler,
      exitCode: null,
      status: "failed",
      stdout: "",
      stderr: "",
      diagnostics: `Failed to read markdown handler: ${(error as Error).message}`,
      result: {},
    };
  }

  const parsed = parseMarkdownHandler(content);
  const built = buildMarkdownResult(parsed);

  if (!built.ok) {
    return {
      handler,
      exitCode: null,
      status: "invalid-output",
      stdout: "",
      stderr: "",
      diagnostics: built.reason,
      result: {},
    };
  }

  return {
    handler,
    exitCode: null,
    status: built.status,
    stdout: "",
    stderr: "",
    result: built.result,
  };
};

const buildMarkdownResult = (parsed: {
  frontmatter: Record<string, string | boolean>;
  body: string;
}):
  | { ok: true; status: HookifyHandlerStatus; result: HookifyResult }
  | { ok: false; reason: string } => {
  const { frontmatter, body } = parsed;
  const enabled = frontmatter.enabled !== false;

  if (!enabled) {
    return { ok: true, status: "allowed", result: {} };
  }

  const decision = frontmatter.decision;

  if (decision !== undefined && decision !== "block" && decision !== "allow") {
    return {
      ok: false,
      reason: `Markdown handler has invalid decision: ${JSON.stringify(decision)}.`,
    };
  }

  const emit = frontmatter.emit;
  const defaultEmit: MarkdownEmitField = decision === "block" ? "reason" : "systemMessage";

  if (emit !== undefined && !isMarkdownEmitField(emit)) {
    return {
      ok: false,
      reason: `Markdown handler has invalid emit target: ${JSON.stringify(emit)}.`,
    };
  }

  const emitField = (emit as MarkdownEmitField | undefined) ?? defaultEmit;

  const systemMessage = resolveMarkdownField(
    frontmatter.systemMessage,
    "systemMessage",
    emitField,
    body,
  );
  const additionalContext = resolveMarkdownField(
    frontmatter.additionalContext,
    "additionalContext",
    emitField,
    body,
  );
  const reason = resolveMarkdownField(frontmatter.reason, "reason", emitField, body);

  if (decision === "block") {
    if (reason === undefined) {
      return {
        ok: false,
        reason: "Markdown handler with decision=block requires a reason or a non-empty body.",
      };
    }

    return {
      ok: true,
      status: "blocked",
      result: {
        decision: "block",
        reason,
        ...(additionalContext !== undefined ? { additionalContext } : {}),
        ...(systemMessage !== undefined ? { systemMessage } : {}),
      },
    };
  }

  if (reason !== undefined) {
    return {
      ok: false,
      reason: "Markdown handler may only set reason when decision=block.",
    };
  }

  return {
    ok: true,
    status: "allowed",
    result: {
      ...(decision === "allow" ? { decision: "allow" as const } : {}),
      ...(additionalContext !== undefined ? { additionalContext } : {}),
      ...(systemMessage !== undefined ? { systemMessage } : {}),
    },
  };
};

const resolveMarkdownField = (
  explicit: string | boolean | undefined,
  field: MarkdownEmitField,
  emitField: MarkdownEmitField,
  body: string,
): string | undefined => {
  if (typeof explicit === "string" && explicit !== "") {
    return explicit;
  }

  if (explicit === true || explicit === false) {
    return undefined;
  }

  if (emitField === field && body !== "") {
    return body;
  }

  return undefined;
};

const isMarkdownEmitField = (value: string | boolean): value is MarkdownEmitField =>
  typeof value === "string" && (MARKDOWN_EMIT_FIELDS as readonly string[]).includes(value);

const interpretHookifyExecution = <Native>(
  handler: HookifyDiscoveredHandler<Native>,
  execution: SpawnHookifyProcessResult,
): HookifyExecutedHandler<Native> => {
  if (execution.timedOut) {
    return {
      handler,
      exitCode: execution.exitCode,
      status: "timed-out",
      stdout: execution.stdout,
      stderr: execution.stderr,
      diagnostics: `Hook timed out after ${execution.exitCode === null ? "kill" : "exit"}.`,
      result: {},
    };
  }

  if (execution.exitCode === 2) {
    const reason = firstNonEmptyString(execution.stderr, execution.stdout) ?? "Hook blocked.";

    return {
      handler,
      exitCode: execution.exitCode,
      status: "blocked",
      stdout: execution.stdout,
      stderr: execution.stderr,
      result: {
        decision: "block",
        reason,
      },
    };
  }

  if (execution.exitCode !== 0) {
    return {
      handler,
      exitCode: execution.exitCode,
      status: "failed",
      stdout: execution.stdout,
      stderr: execution.stderr,
      diagnostics: `Hook exited with code ${execution.exitCode}.`,
      result: {},
    };
  }

  const trimmedStdout = execution.stdout.trim();

  if (trimmedStdout === "") {
    return {
      handler,
      exitCode: execution.exitCode,
      status: "allowed",
      stdout: execution.stdout,
      stderr: execution.stderr,
      result: {},
    };
  }

  const parsed = tryParseHookifyResult(trimmedStdout);

  if (parsed.ok) {
    return {
      handler,
      exitCode: execution.exitCode,
      status: parsed.value.decision === "block" ? "blocked" : "allowed",
      stdout: execution.stdout,
      stderr: execution.stderr,
      result: parsed.value,
    };
  }

  return {
    handler,
    exitCode: execution.exitCode,
    status: parsed.invalidJson ? "allowed" : "invalid-output",
    stdout: execution.stdout,
    stderr: execution.stderr,
    diagnostics: parsed.invalidJson ? undefined : parsed.reason,
    result: parsed.invalidJson ? { systemMessage: trimmedStdout } : {},
  };
};

const tryParseHookifyResult = (
  stdout: string,
):
  | {
      ok: true;
      value: HookifyResult;
    }
  | {
      ok: false;
      invalidJson: boolean;
      reason?: string;
    } => {
  let value: unknown;

  try {
    value = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      invalidJson: true,
    };
  }

  if (isHookifyBlockResult(value)) {
    return {
      ok: true,
      value,
    };
  }

  if (isHookifyPassResult(value)) {
    return {
      ok: true,
      value,
    };
  }

  return {
    ok: false,
    invalidJson: false,
    reason: "Hook returned JSON that does not match the Hookify result contract.",
  };
};

const isHookifyBlockResult = (value: unknown): value is HookifyResult & { decision: "block" } =>
  typeof value === "object" &&
  value !== null &&
  hasOnlyHookifyResultKeys(value, ["decision", "reason", "additionalContext", "systemMessage"]) &&
  "decision" in value &&
  value.decision === "block" &&
  "reason" in value &&
  typeof value.reason === "string" &&
  (!("additionalContext" in value) || typeof value.additionalContext === "string") &&
  (!("systemMessage" in value) || typeof value.systemMessage === "string");

const isHookifyPassResult = (value: unknown): value is HookifyResult =>
  typeof value === "object" &&
  value !== null &&
  hasOnlyHookifyResultKeys(value, ["decision", "additionalContext", "systemMessage"]) &&
  (!("decision" in value) || value.decision === "allow") &&
  (!("additionalContext" in value) || typeof value.additionalContext === "string") &&
  (!("systemMessage" in value) || typeof value.systemMessage === "string");

const hasOnlyHookifyResultKeys = (value: object, allowedKeys: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowedKeys.includes(key));

const toProcessCommand = (
  handler: HookifyDiscoveredHandler,
): {
  file: string;
  args: string[];
} => {
  switch (handler.runtime) {
    case "ts":
    case "mts":
    case "cts":
    case "js":
    case "mjs":
    case "cjs":
      return {
        file: process.execPath,
        args: [handler.realpath],
      };
    case "sh":
    case "bash":
      return {
        file: "/bin/bash",
        args: [handler.realpath],
      };
    default:
      throw new Error(`Unsupported hook runtime: ${handler.runtime}`);
  }
};

const readDirectoryEntries = async (
  pathname: string,
): Promise<
  Array<{
    name: string;
  }>
> => {
  try {
    const entries = await readdir(pathname, { withFileTypes: true });

    return entries
      .filter((entry) => !entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
      }));
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }
};

const compareHookifyHandlersWithinRoot = (
  left: HookifyDiscoveredHandler,
  right: HookifyDiscoveredHandler,
): number => {
  const leftOrderPrefix = left.orderPrefix ?? Number.POSITIVE_INFINITY;
  const rightOrderPrefix = right.orderPrefix ?? Number.POSITIVE_INFINITY;

  if (leftOrderPrefix !== rightOrderPrefix) {
    return leftOrderPrefix - rightOrderPrefix;
  }

  if (left.name !== right.name) {
    return left.name.localeCompare(right.name);
  }

  return left.pathname.localeCompare(right.pathname);
};

const filterHookifyRoots = async (
  pathnames: readonly string[],
): Promise<HookifyExecutionRoot[]> => {
  const roots: HookifyExecutionRoot[] = [];

  for (const pathname of pathnames) {
    if (await isDirectory(join(pathname, HOOKIFY_DIRECTORY_NAME))) {
      roots.push({
        scope: "project",
        rootPath: pathname,
      });
    }
  }

  return roots;
};

const collectAncestorPaths = (cwd: string, boundaryRoot: string): string[] => {
  const ancestors: string[] = [];
  let current = cwd;

  while (true) {
    ancestors.push(current);

    if (current === boundaryRoot) {
      break;
    }
    const resolvedParent = normalizeParentPath(current);

    if (resolvedParent === current) {
      break;
    }

    current = resolvedParent;
  }

  return ancestors.reverse();
};

const normalizeParentPath = (pathname: string): string => dirname(pathname);

const resolvePathname = async (pathname: string): Promise<string> => {
  try {
    return await realpath(pathname);
  } catch (error) {
    if (isMissingPathError(error)) {
      return pathname;
    }

    throw error;
  }
};

const resolveDirectoryPathIfPossible = async (pathname: string): Promise<string> => {
  const resolvedPathname = await resolvePathname(pathname);

  if (!(await isDirectory(resolvedPathname))) {
    throw new Error(`Expected a directory: ${pathname}`);
  }

  return resolvedPathname;
};

const findGitRoot = async (cwd: string): Promise<string | undefined> => {
  let current = cwd;

  while (true) {
    const gitPath = join(current, ".git");

    if (await pathExists(gitPath)) {
      return current;
    }

    const parent = normalizeParentPath(current);

    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
};

const defaultHomeDirectory = (): string | undefined => {
  const pathname = homedir();

  return pathname === "" ? undefined : pathname;
};

const pathExists = async (pathname: string): Promise<boolean> => {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
};

const isDirectory = async (pathname: string): Promise<boolean> => {
  try {
    return (await stat(pathname)).isDirectory();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
};

const writeJsonFile = async (pathname: string, value: unknown): Promise<void> => {
  await writeFile(pathname, JSON.stringify(value, null, 2));
};

const firstNonEmptyString = (...values: string[]): string | undefined => {
  for (const value of values) {
    const trimmed = value.trim();

    if (trimmed !== "") {
      return trimmed;
    }
  }

  return undefined;
};

const uniqueNonEmptyStrings = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();

    if (trimmed === "" || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    uniqueValues.push(trimmed);
  }

  return uniqueValues;
};

const isMissingPathError = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

export const readHookifyEnvelopeFromEnvironment = async <Native = unknown>(): Promise<
  HookifyEnvelope<Native>
> => {
  const pathname = process.env.HOOKIFY_ENVELOPE_PATH;

  if (!pathname) {
    throw new Error("HOOKIFY_ENVELOPE_PATH is not set.");
  }

  return JSON.parse(await readFile(pathname, "utf8")) as HookifyEnvelope<Native>;
};
