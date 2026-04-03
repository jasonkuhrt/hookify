# Hookify

Hookify is a neutral hook runtime for coding agents.

It is built around one idea: the engine should standardize discovery, ordering, execution, and schemas without encoding stylistic opinions about how people choose to share or split hook logic across agents.

## Goals

- One versioned envelope that always includes both `native` and `normalized` payloads.
- One deterministic file convention that works at both user and project scope.
- First-class support for explicitly shared hooks via `.all`.
- First-class support for agent-specific hooks via `.claude` and `.codex`.
- Thin adapters that translate native Claude/Codex hook IO into the Hookify runtime contract.

## Workspace

- `packages/schema`: versioned Hookify envelope and result types
- `packages/core`: applicability parsing, deterministic ordering, and runtime-facing helpers
- `packages/adapter-codex`: verified Codex event mapping and response translation
- `packages/adapter-claude`: Claude event naming and envelope bootstrap

## Discovery Convention

Hook directories are named after normalized event names:

```text
.hookify/
  pre-tool-use/
  post-tool-use/
  session-start/
  user-prompt-submit/
  stop/
  notification/
  permission-request/
  session-end/
  pre-compact/
  subagent-stop/
```

Hook files express applicability in the filename:

```text
10-block-cmux.all.ts
20-terminal-tabs.claude.sh
30-bash-guard.codex.ts
```

Supported applicability suffixes:

- `.all`
- `.claude`
- `.codex`

The runtime is intentionally neutral. It does not privilege `.all` over agent-specific files, or vice versa.

## Envelope

Every executed hook receives a versioned envelope that preserves raw agent data while exposing a stable normalized shape:

```json
{
  "version": 1,
  "agent": "codex",
  "event": "pre-tool-use",
  "scope": "project",
  "meta": {
    "cwd": "/worktree",
    "projectRoot": "/worktree",
    "gitRoot": "/worktree",
    "sessionId": "session_123",
    "turnId": "turn_7",
    "transcriptPath": "/tmp/transcript.jsonl"
  },
  "normalized": {
    "tool": {
      "kind": "bash",
      "name": "Bash",
      "command": "cmux list-workspaces"
    }
  },
  "native": {
    "hook_event_name": "PreToolUse",
    "tool_name": "Bash",
    "tool_input": {
      "command": "cmux list-workspaces"
    }
  }
}
```

## Response Shape

Hooks return one Hookify-native result shape. Adapters translate it back into native Claude or Codex hook output.

```json
{
  "decision": "block",
  "reason": "cmux is forbidden"
}
```

Optional warnings/context are carried in `systemMessage`.

## Status

This repo starts with the core schema and adapter surface for the shared design. The next milestone is native fixture capture for both agents so the adapters can be hardened around real-world payloads instead of only verified event-name contracts.
