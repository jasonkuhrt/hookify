import { createCodexEnvelope, toCodexOutput, type CodexNativeEvent } from "@hookify/adapter-codex";
import {
  executeHookifyHandlers,
  resolveHookifyRuntimeContext,
  type HookifyExecutionReport,
  type HookifyRuntimeContext,
} from "@hookify/runtime";

export interface ExecuteCodexHookifyOptions<TNativeEvent extends CodexNativeEvent> {
  native: TNativeEvent;
  homeDirectory?: string;
  projectRoot?: string;
  gitRoot?: string;
  timeoutMs?: number;
}

export interface CodexHookifyExecution<TNativeEvent extends CodexNativeEvent> {
  context: HookifyRuntimeContext;
  report: HookifyExecutionReport<TNativeEvent>;
  output: ReturnType<typeof toCodexOutput>;
}

export const executeCodexHookify = async <TNativeEvent extends CodexNativeEvent>(
  options: ExecuteCodexHookifyOptions<TNativeEvent>,
): Promise<CodexHookifyExecution<TNativeEvent>> => {
  const context = await resolveHookifyRuntimeContext({
    cwd: options.native.cwd,
    ...(options.homeDirectory ? { homeDirectory: options.homeDirectory } : {}),
    ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
    ...(options.gitRoot ? { gitRoot: options.gitRoot } : {}),
  });
  const report = await executeHookifyHandlers({
    envelope: createCodexEnvelope({
      native: options.native,
      scope: "project",
      projectRoot: context.projectRoot,
      ...(context.gitRoot ? { gitRoot: context.gitRoot } : {}),
    }),
    roots: context.roots,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });

  return {
    context,
    report,
    output: toCodexOutput(report.aggregatedResult),
  };
};

export const parseCodexNativeEvent = (value: string): CodexNativeEvent =>
  JSON.parse(value) as CodexNativeEvent;
