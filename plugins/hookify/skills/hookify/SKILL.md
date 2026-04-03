---
name: hookify
description: Learn, inspect, and manage Hookify-based hook setups across Claude and Codex. Use when the user mentions Hookify, wants to understand cross-agent hook behavior, wants to inspect current user-level or project-level hook config, or wants help adopting Hookify in a repo or home directory.
metadata:
  short-description: Learn and inspect Hookify setups
---

# Hookify

Use this skill as the general entrypoint for Hookify work.

## Quick start

1. Determine the user's goal:
   - learn how Hookify works
   - inspect current hook surfaces
   - adopt Hookify at user scope
   - adopt Hookify at project scope
   - migrate existing Claude/Codex hook logic toward Hookify
2. Read `references/hook-authoring.md` when the task involves event names, payloads, or output behavior.
3. Read `references/setup-surfaces.md` when the task involves where Hookify should live or how it should be packaged.
4. Inspect the real current config before proposing changes. For Claude and Codex, prefer direct file inspection over memory.

## What this skill is for

- Explaining the current Hookify model
- Comparing Claude and Codex hook surfaces
- Inspecting whether a project already has user-level or project-level hook registration
- Planning or implementing Hookify adoption in a repo
- Explaining when a hook should be `.all`, `.claude`, or `.codex`

## Workflow

### 1. Identify scope

Determine whether the user wants:

- user-level configuration
- project-level configuration
- both

When scope is unclear but the repository already contains Hookify files, inspect first and continue from what exists.

### 2. Build a local evidence base

Inspect the active surfaces before making claims:

- Claude user config
- Claude project config
- Codex user hooks
- Codex project hooks
- any existing `.hookify/` directories

Do not assume a hook is absent until symlinks and realpaths have been checked.

### 3. Explain the relevant cross-agent surface

Use `references/hook-authoring.md` to answer:

- which events exist in both agents
- which fields are shared
- which outputs can block, warn, or continue
- where the remaining platform gaps are

Keep the explanation grounded in what the current agents actually support.

### 4. Move from explanation to action

If the user wants adoption or changes:

- preserve existing intent
- choose the minimal placement that matches the requested scope
- generate native dispatcher files through `@hookify/install` rather than hand-writing local glue
- keep shared behavior explicit with `.all`
- keep agent-specific behavior explicit with `.claude` or `.codex`

## Companion skills

- Use [hookify-write-hook](../hookify-write-hook/SKILL.md) when the main task is authoring or updating a Hookify hook file.
