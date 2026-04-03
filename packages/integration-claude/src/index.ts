import {
  createClaudeEnvelope,
  toClaudeOutput,
  type ClaudeNativeEvent,
} from "@hookify/adapter-claude";
import {
  executeHookifyHandlers,
  resolveHookifyRuntimeContext,
  type HookifyExecutionReport,
  type HookifyRuntimeContext,
} from "@hookify/runtime";

export interface ExecuteClaudeHookifyOptions<TNativeEvent extends ClaudeNativeEvent> {
  native: TNativeEvent;
  homeDirectory?: string;
  projectRoot?: string;
  gitRoot?: string;
  timeoutMs?: number;
  cwdFallback?: string;
}

export interface ClaudeHookifyExecution<TNativeEvent extends ClaudeNativeEvent> {
  context: HookifyRuntimeContext;
  report: HookifyExecutionReport<TNativeEvent>;
  output: ReturnType<typeof toClaudeOutput>;
}

export const executeClaudeHookify = async <TNativeEvent extends ClaudeNativeEvent>(
  options: ExecuteClaudeHookifyOptions<TNativeEvent>,
): Promise<ClaudeHookifyExecution<TNativeEvent>> => {
  const context = await resolveHookifyRuntimeContext({
    cwd:
      (typeof options.native.cwd === "string" && options.native.cwd !== ""
        ? options.native.cwd
        : undefined) ??
      options.cwdFallback ??
      options.projectRoot ??
      process.cwd(),
    ...(options.homeDirectory ? { homeDirectory: options.homeDirectory } : {}),
    ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
    ...(options.gitRoot ? { gitRoot: options.gitRoot } : {}),
  });
  const envelope = createClaudeEnvelope({
    native: options.native,
    scope: "project",
    projectRoot: context.projectRoot,
    ...(context.gitRoot ? { gitRoot: context.gitRoot } : {}),
  });
  const report = await executeHookifyHandlers({
    envelope,
    roots: context.roots,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });

  return {
    context,
    report,
    output: toClaudeOutput(envelope.event, report.aggregatedResult),
  };
};

export const parseClaudeNativeEvent = (value: string): ClaudeNativeEvent =>
  JSON.parse(value) as ClaudeNativeEvent;
