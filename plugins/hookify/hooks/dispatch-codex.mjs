#!/usr/bin/env node

// packages/schema/src/index.ts
var HOOKIFY_ENVELOPE_VERSION = 1;

// packages/adapter-codex/src/index.ts
var codexEventNameMap = {
  PreToolUse: "pre-tool-use",
  PostToolUse: "post-tool-use",
  SessionStart: "session-start",
  UserPromptSubmit: "user-prompt-submit",
  Stop: "stop"
};
var createCodexEnvelope = (options) => ({
  version: HOOKIFY_ENVELOPE_VERSION,
  agent: "codex",
  event: codexEventNameMap[options.native.hook_event_name],
  scope: options.scope,
  meta: {
    cwd: options.native.cwd,
    projectRoot: options.projectRoot,
    ...options.gitRoot ? { gitRoot: options.gitRoot } : {},
    sessionId: options.native.session_id,
    ...options.native.turn_id ? { turnId: options.native.turn_id } : {},
    transcriptPath: options.native.transcript_path
  },
  normalized: normalizeCodexEvent(options.native),
  native: options.native
});
var toCodexOutput = (event, result) => {
  const output = {};
  if (result.systemMessage) {
    output.systemMessage = result.systemMessage;
  }
  if (result.decision === "block") {
    if (event === "pre-tool-use") {
      output.hookSpecificOutput = {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: result.reason
      };
      return output;
    }
    output.decision = "block";
    output.reason = result.reason;
  }
  if (result.additionalContext) {
    switch (event) {
      case "session-start":
        output.hookSpecificOutput = {
          hookEventName: "SessionStart",
          additionalContext: result.additionalContext
        };
        break;
      case "user-prompt-submit":
        output.hookSpecificOutput = {
          hookEventName: "UserPromptSubmit",
          additionalContext: result.additionalContext
        };
        break;
      case "post-tool-use":
        output.hookSpecificOutput = {
          hookEventName: "PostToolUse",
          additionalContext: result.additionalContext
        };
        break;
    }
  }
  return output;
};
var normalizeCodexEvent = (native) => {
  switch (native.hook_event_name) {
    case "PreToolUse":
      return {
        tool: {
          kind: "bash",
          name: native.tool_name,
          command: native.tool_input.command,
          input: native.tool_input
        }
      };
    case "PostToolUse":
      return {
        tool: {
          kind: "bash",
          name: native.tool_name,
          command: native.tool_input.command,
          input: native.tool_input,
          response: native.tool_response
        }
      };
    case "SessionStart":
      return {
        session: {
          source: native.source
        }
      };
    case "UserPromptSubmit":
      return {
        prompt: {
          text: native.prompt
        }
      };
    case "Stop":
      return {
        assistant: {
          lastMessage: native.last_assistant_message
        },
        session: {
          stopHookActive: native.stop_hook_active
        }
      };
  }
};

// packages/runtime/src/index.ts
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename as basename2, dirname, isAbsolute, join } from "node:path";
import { homedir, tmpdir } from "node:os";

// packages/core/src/index.ts
import { basename } from "node:path";
var HOOK_FILE_PATTERN = /^(?:(\d+)-)?(.+)\.(all|claude|codex)\.(ts|mts|cts|js|mjs|cjs|sh|bash|md)$/u;
var parseHookFileName = (pathname) => {
  const match = HOOK_FILE_PATTERN.exec(basename(pathname));
  if (!match) {
    return null;
  }
  const [, orderPrefixText, name, applicability, runtime] = match;
  return {
    ...orderPrefixText ? { orderPrefix: Number.parseInt(orderPrefixText, 10) } : {},
    name,
    applicability,
    runtime
  };
};
var toHookEnvironment = (envelope, extras = {}) => {
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
    ...extras
  }).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
};
var parseMarkdownHandler = (content) => {
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
    body: bodyLines.join(`
`).trim()
  };
};
var parseFlatYaml = (lines) => {
  const entries = {};
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
var coerceYamlScalar = (rawValue) => {
  const withoutComment = stripInlineComment(rawValue).trim();
  if (withoutComment === "true") {
    return true;
  }
  if (withoutComment === "false") {
    return false;
  }
  return unquoteYamlString(withoutComment);
};
var stripInlineComment = (value) => {
  if (value.startsWith('"') || value.startsWith("'")) {
    return value;
  }
  const commentIndex = value.indexOf(" #");
  return commentIndex === -1 ? value : value.slice(0, commentIndex);
};
var unquoteYamlString = (value) => {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if (first === '"' && last === '"' || first === "'" && last === "'") {
      return value.slice(1, -1);
    }
  }
  return value;
};

// packages/runtime/src/index.ts
var HOOKIFY_DIRECTORY_NAME = ".hookify";
var HOOKIFY_DEFAULT_TIMEOUT_MS = 600000;
var discoverHookifyHandlers = async (options) => {
  const handlers = [];
  const seenRealpaths = new Set;
  for (const root of options.roots) {
    const eventDirectoryPath = join(root.rootPath, HOOKIFY_DIRECTORY_NAME, options.envelope.event);
    const entries = await readDirectoryEntries(eventDirectoryPath);
    const rootHandlers = [];
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
        envelope: withScope(options.envelope, root.scope)
      });
    }
    handlers.push(...rootHandlers.sort(compareHookifyHandlersWithinRoot));
  }
  return handlers;
};
var executeHookifyHandlers = async (options) => {
  const handlers = await discoverHookifyHandlers(options);
  const timeoutMs = options.timeoutMs ?? HOOKIFY_DEFAULT_TIMEOUT_MS;
  const executedHandlers = await Promise.all(handlers.map((handler) => executeHookifyHandler(handler, timeoutMs)));
  return {
    handlers: executedHandlers,
    aggregatedResult: aggregateHookifyResults(executedHandlers)
  };
};
var aggregateHookifyResults = (executedHandlers) => {
  const blockReasons = uniqueNonEmptyStrings(executedHandlers.flatMap((handler) => handler.result.decision === "block" ? [handler.result.reason] : []));
  const systemMessages = uniqueNonEmptyStrings(executedHandlers.flatMap((handler) => handler.result.systemMessage ? [handler.result.systemMessage] : []));
  const additionalContexts = uniqueNonEmptyStrings(executedHandlers.flatMap((handler) => handler.result.additionalContext ? [handler.result.additionalContext] : []));
  if (blockReasons.length > 0) {
    return {
      decision: "block",
      reason: blockReasons.join(`

`),
      ...additionalContexts.length > 0 ? { additionalContext: additionalContexts.join(`

`) } : {},
      ...systemMessages.length > 0 ? { systemMessage: systemMessages.join(`

`) } : {}
    };
  }
  return {
    ...additionalContexts.length > 0 ? { additionalContext: additionalContexts.join(`

`) } : {},
    ...systemMessages.length > 0 ? { systemMessage: systemMessages.join(`

`) } : {}
  };
};
var withScope = (envelope, scope) => ({
  ...envelope,
  version: HOOKIFY_ENVELOPE_VERSION,
  scope
});
var resolveHookifyRuntimeContext = async (options) => {
  const cwd = await resolveDirectoryPathIfPossible(options.cwd);
  const homeDirectory = options.homeDirectory ? await resolveDirectoryPathIfPossible(options.homeDirectory) : defaultHomeDirectory();
  const gitRoot = options.gitRoot !== undefined ? await resolveDirectoryPathIfPossible(options.gitRoot) : await findGitRoot(cwd);
  const boundaryRoot = options.projectRoot !== undefined ? await resolveDirectoryPathIfPossible(options.projectRoot) : gitRoot ?? cwd;
  const ancestors = collectAncestorPaths(cwd, boundaryRoot);
  const discoveredProjectRoots = await filterHookifyRoots(ancestors);
  const projectRoot = discoveredProjectRoots.at(-1)?.rootPath ?? boundaryRoot;
  const mainWorktreeRoots = [];
  const mainWorktreeRoot = gitRoot ? await findMainWorktreeRoot(gitRoot) : undefined;
  if (mainWorktreeRoot !== undefined && mainWorktreeRoot !== gitRoot && !discoveredProjectRoots.some((root) => root.rootPath === mainWorktreeRoot) && await isDirectory(join(mainWorktreeRoot, HOOKIFY_DIRECTORY_NAME))) {
    mainWorktreeRoots.push({ scope: "project", rootPath: mainWorktreeRoot });
  }
  const projectRoots = [...discoveredProjectRoots, ...mainWorktreeRoots];
  return {
    cwd,
    projectRoot,
    ...gitRoot ? { gitRoot } : {},
    roots: [
      ...homeDirectory ? [{ scope: "user", rootPath: homeDirectory }] : [],
      ...projectRoots.length > 0 ? projectRoots : [{ scope: "project", rootPath: boundaryRoot }]
    ]
  };
};
var executeHookifyHandler = async (handler, timeoutMs) => {
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
      writeJsonFile(normalizedPath, handler.envelope.normalized)
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
        HOOKIFY_HANDLER_RUNTIME: handler.runtime
      })
    };
    const execution = await spawnHookifyProcess(handler, {
      timeoutMs,
      environment,
      stdin: JSON.stringify(handler.envelope)
    });
    return interpretHookifyExecution(handler, execution);
  } finally {
    await rm(temporaryDirectoryPath, { recursive: true, force: true });
  }
};
var spawnHookifyProcess = async (handler, options) => {
  const command = toProcessCommand(handler);
  const child = spawn(command.file, command.args, {
    cwd: handler.envelope.meta.cwd,
    env: options.environment,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stdoutChunks = [];
  const stderrChunks = [];
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
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    return {
      exitCode,
      timedOut,
      stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      stderr: Buffer.concat(stderrChunks).toString("utf8")
    };
  } finally {
    clearTimeout(timeout);
  }
};
var MARKDOWN_EMIT_FIELDS = ["systemMessage", "additionalContext", "reason"];
var executeMarkdownHandler = async (handler) => {
  let content;
  try {
    content = await readFile(handler.realpath, "utf8");
  } catch (error) {
    return {
      handler,
      exitCode: null,
      status: "failed",
      stdout: "",
      stderr: "",
      diagnostics: `Failed to read markdown handler: ${error.message}`,
      result: {}
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
      result: {}
    };
  }
  return {
    handler,
    exitCode: null,
    status: built.status,
    stdout: "",
    stderr: "",
    result: built.result
  };
};
var buildMarkdownResult = (parsed) => {
  const { frontmatter, body } = parsed;
  const enabled = frontmatter.enabled !== false;
  if (!enabled) {
    return { ok: true, status: "allowed", result: {} };
  }
  const decision = frontmatter.decision;
  if (decision !== undefined && decision !== "block" && decision !== "allow") {
    return {
      ok: false,
      reason: `Markdown handler has invalid decision: ${JSON.stringify(decision)}.`
    };
  }
  const emit = frontmatter.emit;
  const defaultEmit = decision === "block" ? "reason" : "systemMessage";
  if (emit !== undefined && !isMarkdownEmitField(emit)) {
    return {
      ok: false,
      reason: `Markdown handler has invalid emit target: ${JSON.stringify(emit)}.`
    };
  }
  const emitField = emit ?? defaultEmit;
  const systemMessage = resolveMarkdownField(frontmatter.systemMessage, "systemMessage", emitField, body);
  const additionalContext = resolveMarkdownField(frontmatter.additionalContext, "additionalContext", emitField, body);
  const reason = resolveMarkdownField(frontmatter.reason, "reason", emitField, body);
  if (decision === "block") {
    if (reason === undefined) {
      return {
        ok: false,
        reason: "Markdown handler with decision=block requires a reason or a non-empty body."
      };
    }
    return {
      ok: true,
      status: "blocked",
      result: {
        decision: "block",
        reason,
        ...additionalContext !== undefined ? { additionalContext } : {},
        ...systemMessage !== undefined ? { systemMessage } : {}
      }
    };
  }
  if (reason !== undefined) {
    return {
      ok: false,
      reason: "Markdown handler may only set reason when decision=block."
    };
  }
  return {
    ok: true,
    status: "allowed",
    result: {
      ...decision === "allow" ? { decision: "allow" } : {},
      ...additionalContext !== undefined ? { additionalContext } : {},
      ...systemMessage !== undefined ? { systemMessage } : {}
    }
  };
};
var resolveMarkdownField = (explicit, field, emitField, body) => {
  if (typeof explicit === "string" && explicit !== "") {
    return explicit;
  }
  if (explicit === true || explicit === false) {
    return;
  }
  if (emitField === field && body !== "") {
    return body;
  }
  return;
};
var isMarkdownEmitField = (value) => typeof value === "string" && MARKDOWN_EMIT_FIELDS.includes(value);
var interpretHookifyExecution = (handler, execution) => {
  if (execution.timedOut) {
    return {
      handler,
      exitCode: execution.exitCode,
      status: "timed-out",
      stdout: execution.stdout,
      stderr: execution.stderr,
      diagnostics: `Hook timed out after ${execution.exitCode === null ? "kill" : "exit"}.`,
      result: {}
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
        reason
      }
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
      result: {}
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
      result: {}
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
      result: parsed.value
    };
  }
  return {
    handler,
    exitCode: execution.exitCode,
    status: parsed.invalidJson ? "allowed" : "invalid-output",
    stdout: execution.stdout,
    stderr: execution.stderr,
    diagnostics: parsed.invalidJson ? undefined : parsed.reason,
    result: parsed.invalidJson ? { systemMessage: trimmedStdout } : {}
  };
};
var tryParseHookifyResult = (stdout) => {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      invalidJson: true
    };
  }
  if (isHookifyBlockResult(value)) {
    return {
      ok: true,
      value
    };
  }
  if (isHookifyPassResult(value)) {
    return {
      ok: true,
      value
    };
  }
  return {
    ok: false,
    invalidJson: false,
    reason: "Hook returned JSON that does not match the Hookify result contract."
  };
};
var isHookifyBlockResult = (value) => typeof value === "object" && value !== null && hasOnlyHookifyResultKeys(value, ["decision", "reason", "additionalContext", "systemMessage"]) && ("decision" in value) && value.decision === "block" && ("reason" in value) && typeof value.reason === "string" && (!("additionalContext" in value) || typeof value.additionalContext === "string") && (!("systemMessage" in value) || typeof value.systemMessage === "string");
var isHookifyPassResult = (value) => typeof value === "object" && value !== null && hasOnlyHookifyResultKeys(value, ["decision", "additionalContext", "systemMessage"]) && (!("decision" in value) || value.decision === "allow") && (!("additionalContext" in value) || typeof value.additionalContext === "string") && (!("systemMessage" in value) || typeof value.systemMessage === "string");
var hasOnlyHookifyResultKeys = (value, allowedKeys) => Object.keys(value).every((key) => allowedKeys.includes(key));
var toProcessCommand = (handler) => {
  switch (handler.runtime) {
    case "ts":
    case "mts":
    case "cts":
    case "js":
    case "mjs":
    case "cjs":
      return {
        file: process.execPath,
        args: [handler.realpath]
      };
    case "sh":
    case "bash":
      return {
        file: "/bin/bash",
        args: [handler.realpath]
      };
    default:
      throw new Error(`Unsupported hook runtime: ${handler.runtime}`);
  }
};
var readDirectoryEntries = async (pathname) => {
  try {
    const entries = await readdir(pathname, { withFileTypes: true });
    return entries.filter((entry) => !entry.isDirectory()).map((entry) => ({
      name: entry.name
    }));
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
};
var compareHookifyHandlersWithinRoot = (left, right) => {
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
var filterHookifyRoots = async (pathnames) => {
  const roots = [];
  for (const pathname of pathnames) {
    if (await isDirectory(join(pathname, HOOKIFY_DIRECTORY_NAME))) {
      roots.push({
        scope: "project",
        rootPath: pathname
      });
    }
  }
  return roots;
};
var collectAncestorPaths = (cwd, boundaryRoot) => {
  const ancestors = [];
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
var normalizeParentPath = (pathname) => dirname(pathname);
var resolvePathname = async (pathname) => {
  try {
    return await realpath(pathname);
  } catch (error) {
    if (isMissingPathError(error)) {
      return pathname;
    }
    throw error;
  }
};
var resolveDirectoryPathIfPossible = async (pathname) => {
  const resolvedPathname = await resolvePathname(pathname);
  if (!await isDirectory(resolvedPathname)) {
    throw new Error(`Expected a directory: ${pathname}`);
  }
  return resolvedPathname;
};
var findMainWorktreeRoot = async (gitRoot) => {
  const gitPath = join(gitRoot, ".git");
  let info;
  try {
    info = await stat(gitPath);
  } catch {
    return;
  }
  if (info.isDirectory()) {
    return gitRoot;
  }
  if (!info.isFile()) {
    return;
  }
  let content;
  try {
    content = await readFile(gitPath, "utf8");
  } catch {
    return;
  }
  const match = content.match(/^gitdir:\s*(.+?)\s*$/m);
  if (!match) {
    return;
  }
  const gitdir = isAbsolute(match[1]) ? match[1] : join(gitRoot, match[1]);
  const worktreesDir = dirname(gitdir);
  const dotGitDir = dirname(worktreesDir);
  if (basename2(worktreesDir) !== "worktrees" || basename2(dotGitDir) !== ".git") {
    return;
  }
  const mainWorktreeRoot = dirname(dotGitDir);
  if (!await isDirectory(mainWorktreeRoot)) {
    return;
  }
  return resolvePathname(mainWorktreeRoot);
};
var findGitRoot = async (cwd) => {
  let current = cwd;
  while (true) {
    const gitPath = join(current, ".git");
    if (await pathExists(gitPath)) {
      return current;
    }
    const parent = normalizeParentPath(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
};
var defaultHomeDirectory = () => {
  const pathname = homedir();
  return pathname === "" ? undefined : pathname;
};
var pathExists = async (pathname) => {
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
var isDirectory = async (pathname) => {
  try {
    return (await stat(pathname)).isDirectory();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
};
var writeJsonFile = async (pathname, value) => {
  await writeFile(pathname, JSON.stringify(value, null, 2));
};
var firstNonEmptyString = (...values) => {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed !== "") {
      return trimmed;
    }
  }
  return;
};
var uniqueNonEmptyStrings = (values) => {
  const seen = new Set;
  const uniqueValues = [];
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
var isMissingPathError = (error) => typeof error === "object" && error !== null && ("code" in error) && error.code === "ENOENT";

// packages/integration-codex/src/index.ts
var executeCodexHookify = async (options) => {
  const context = await resolveHookifyRuntimeContext({
    cwd: options.native.cwd,
    ...options.homeDirectory ? { homeDirectory: options.homeDirectory } : {},
    ...options.projectRoot ? { projectRoot: options.projectRoot } : {},
    ...options.gitRoot ? { gitRoot: options.gitRoot } : {}
  });
  const envelope = createCodexEnvelope({
    native: options.native,
    scope: "project",
    projectRoot: context.projectRoot,
    ...context.gitRoot ? { gitRoot: context.gitRoot } : {}
  });
  const report = await executeHookifyHandlers({
    envelope,
    roots: context.roots,
    ...options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}
  });
  return {
    context,
    report,
    output: toCodexOutput(envelope.event, report.aggregatedResult)
  };
};
var parseCodexNativeEvent = (value) => JSON.parse(value);

// plugins/hookify/hooks/dispatch-codex.ts
var readStandardInput = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};
var main = async () => {
  const input = (await readStandardInput()).trim();
  if (input === "") {
    return;
  }
  const execution = await executeCodexHookify({
    native: parseCodexNativeEvent(input)
  });
  if (Object.keys(execution.output).length > 0) {
    process.stdout.write(`${JSON.stringify(execution.output)}
`);
  }
};
try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`hookify codex dispatcher failed open: ${message}
`);
}
