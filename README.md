[![CI](https://github.com/jasonkuhrt/hookify/actions/workflows/ci.yml/badge.svg)](https://github.com/jasonkuhrt/hookify/actions/workflows/ci.yml)

# Hookify

Hookify standardizes hook discovery and execution for Claude and Codex without discarding either agent's native JSON.

## Grounding

Coding agents can run hooks around prompt submission, tool calls, and session lifecycle events. Claude and Codex expose different event names, different payload shapes, and different output contracts for those same moments.

## Problem

Teams that want one hook policy across agents end up maintaining two incompatible systems. Shared rules drift because the common ground is smaller than it first looks, while agent-specific rules become hard to colocate and reason about. Even when both agents support project hooks, their registration surfaces, event names, payloads, and output contracts differ enough that “same rule, two agents” turns into duplicate glue code.

## Solution

Hookify splits the problem in two. A thin adapter speaks each agent's native hook protocol. The neutral runtime speaks one versioned contract for discovery, ordering, execution, and results.

Sharing is explicit in the filesystem. A hook file opts into `.all`, `.claude`, or `.codex` in its own name, so readers can tell whether a rule is shared or agent-specific without opening the file.

The runtime stays neutral about authoring style. It supports shared hooks, split hooks, raw native payload access, and normalized cross-agent access, but it does not encode opinions about which one a repository should prefer.

## Getting Started

```sh
git clone git@github.com:jasonkuhrt/hookify.git
cd hookify
bun install
bun run check
```

`bun run check` runs formatting, lint, and tests for the whole workspace. Once it passes, start in the package that owns your change: `packages/schema` for the contract, `packages/core` for neutral mechanics, and `packages/adapter-*` for agent boundaries. Contributor workflow lives in [CONTRIBUTING.md](CONTRIBUTING.md).

## Concepts

An **event** is the normalized name for a hook moment such as `pre-tool-use`, `post-tool-use`, or `session-start`. Hookify keeps a closed set of [`event`](#event) names so directory layout and adapter code can agree even when Claude and Codex use different native labels.

A **scope** tells the runtime where a hook was discovered. A [`scope`](#scope) is either user or project, which lets one user-level install stay small while project policy remains editable in the repository being worked on.

An **applicability** decides which agents are allowed to run a hook file. Hookify reads [`applicability`](#applicability) from the filename suffix:

```text
10-block-cmux.all.ts
20-rename-tabs.claude.sh
30-bash-guard.codex.ts
```

That keeps sharing explicit. `.all` means the file is eligible for both agents. `.claude` and `.codex` mean the file is agent-specific by choice, not by accident.

A **native payload** is the exact JSON emitted by an agent. A **normalized event** is the cross-agent shape Hookify can talk about without agent-specific field names. The **envelope** carries both, along with scope and session metadata, so a hook can stay portable without losing access to raw detail:

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
    "turnId": "turn_7"
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

An **adapter** is the only place agent quirks belong. An [`adapter`](#adapter) maps native event names into Hookify's [`envelope`](#envelope), extracts a [`normalized event`](#normalized-event), and turns Hookify results back into native hook output. Because adapters own that edge, the neutral runtime does not need to know Codex-only or Claude-only field names.

## Usage

The examples below assume a workspace checkout while the packages are still source-first and unpublished.

For the verified cross-agent event matrix, payload mapping, and output rules, see [docs/hook-authoring.md](docs/hook-authoring.md). For the current skills-first packaging strategy, see [docs/distribution.md](docs/distribution.md).

When you need to decide whether a hook file should run for an agent, parse the filename once and keep the decision in data instead of string-matching ad hoc.

```ts
import { isEligibleApplicability, parseHookFileName } from "@hookify/core";

const parsed = parseHookFileName("/repo/.hookify/pre-tool-use/10-block-cmux.all.ts");

if (parsed && isEligibleApplicability("codex", parsed.applicability)) {
  console.log(parsed.name);
  // "block-cmux"
}
```

When you need shell hooks to know which agent invoked them, derive a stable environment from the [`envelope`](#envelope) rather than exporting one-off variables in each adapter.

```ts
import { toHookEnvironment } from "@hookify/core";

const environment = toHookEnvironment(envelope, {
  HOOKIFY_ENVELOPE_PATH: "/tmp/hookify-envelope.json",
});

console.log(environment.HOOKIFY_AGENT);
// "codex"
```

When you need to turn raw Codex JSON into Hookify data, use the Codex adapter and keep the raw payload intact inside the returned [`envelope`](#envelope).

```ts
import { createCodexEnvelope } from "@hookify/adapter-codex";

const envelope = createCodexEnvelope({
  scope: "project",
  projectRoot: "/repo",
  gitRoot: "/repo",
  native: {
    cwd: "/repo",
    hook_event_name: "PreToolUse",
    model: "gpt-5",
    permission_mode: "workspace-write",
    session_id: "session_123",
    transcript_path: "/tmp/transcript.jsonl",
    turn_id: "turn_7",
    tool_name: "Bash",
    tool_input: {
      command: "cmux list-workspaces",
    },
    tool_use_id: "toolu_123",
  },
});

console.log(envelope.normalized.tool?.command);
// "cmux list-workspaces"
```

When you need the same treatment for Claude, build the [`envelope`](#envelope) through the Claude adapter and let the runtime stay ignorant of Claude's native field layout.

```ts
import { createClaudeEnvelope } from "@hookify/adapter-claude";

const envelope = createClaudeEnvelope({
  scope: "user",
  projectRoot: "/repo",
  native: {
    hook_event_name: "UserPromptSubmit",
    cwd: "/repo",
    session_id: "session_123",
    prompt: "please avoid cmux",
  },
});

console.log(envelope.normalized.prompt?.text);
// "please avoid cmux"
```

When you need to hand a block decision back to Codex, translate the Hookify result at the adapter boundary instead of letting Hookify internals depend on Codex output rules.

```ts
import { toCodexOutput } from "@hookify/adapter-codex";

const output = toCodexOutput({
  decision: "block",
  reason: "cmux is forbidden",
});

console.log(output);
// { decision: "block", reason: "cmux is forbidden" }
```

## Package Index

| Package                                                           | Role                                | Current surface                                                              |
| ----------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| [`@hookify/schema`](packages/schema/src/index.ts)                 | Versioned contract for Hookify data | Agents, events, scopes, tool kinds, envelope shape, result shape             |
| [`@hookify/core`](packages/core/src/index.ts)                     | Neutral runtime helpers             | Filename parsing, applicability checks, environment projection               |
| [`@hookify/adapter-codex`](packages/adapter-codex/src/index.ts)   | Codex boundary                      | Verified Codex event-name mapping, envelope construction, result translation |
| [`@hookify/adapter-claude`](packages/adapter-claude/src/index.ts) | Claude boundary                     | Claude event-name mapping and normalized bootstrap for shared fields         |

This repo does not ship an executable dispatcher yet. The current milestone is nailing the contract, core mechanics, adapter boundaries, and the first skills-first plugin wrapper before the runtime package lands.

## Glossary

#### Adapter

The package layer that translates between one agent's native hook protocol and Hookify's shared contract.

#### Applicability

The filename-level marker that says whether a hook file is eligible for `.all`, `.claude`, or `.codex`.

#### Envelope

The versioned Hookify object that carries agent identity, normalized event name, scope, metadata, normalized data, and the original native payload.

#### Event

The normalized name for a hook moment such as `pre-tool-use`, `post-tool-use`, or `stop`.

#### Native Payload

The exact JSON an agent emitted before Hookify translated anything.

#### Normalized Event

The cross-agent subset of hook data that Hookify can name without agent-specific field names.

#### Scope

The source of a discovered hook file: either user-level or project-level.

Licensed under the [MIT License](LICENSE).
