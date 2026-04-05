---
name: hookify-write-hook
description: Create or update Hookify hook files and rules. Use when the user wants a new Hookify hook, wants to block or warn on a pattern, wants a rule at user or project scope, or wants to express a policy like blocking cmux in `.all`, `.claude`, or `.codex` files.
metadata:
  short-description: Author Hookify hook files
---

# Hookify Write Hook

Use this skill when the job is to author or update Hookify hook files.

## Quick start

1. Determine scope:
   - user
   - project
   - both
2. Determine applicability:
   - `.all`
   - `.claude`
   - `.codex`
3. Determine event:
   - `pre-tool-use`
   - `post-tool-use`
   - `session-start`
   - `user-prompt-submit`
   - `stop`
   - or an agent-specific event when the target agent supports one
4. Determine runtime:
   - `.md` for declarative static content (reminders, fixed block messages)
   - `.ts`/`.mts`/`.cts`/`.js`/`.mjs`/`.cjs` when the rule needs to inspect the envelope or run logic
   - `.sh`/`.bash` for shell-based rules that read `$HOOKIFY_ENVELOPE_PATH`
5. Inspect the existing `.hookify/` tree before creating new files.
6. Read `references/event-map.md` before choosing the event and return shape.

## Authoring rules

- Keep applicability explicit in the filename.
- Keep ordering explicit with numeric prefixes when the directory already uses them.
- Preserve existing local conventions before inventing new ones.
- Prefer the narrowest event that can enforce the requested policy.
- Prefer `.md` when the rule is a static reminder or fixed-message block — it is the simplest runtime and needs no shebang, bundler, or permissions.
- When the behavior is meant for both Claude and Codex, `.all` is valid.
- When the behavior depends on agent-only semantics, split into `.claude` or `.codex`.

## Event selection guidance

- To block a shell command before it runs, use `pre-tool-use`.
- To warn or react after a command already ran, use `post-tool-use`.
- To inject context before the model handles a user request, use `user-prompt-submit`.
- To force another round of work instead of stopping, use `stop`.

## Current platform caveats

- Codex currently documents Bash-only interception for `pre-tool-use` and `post-tool-use`.
- Claude exposes richer lifecycle and permission surfaces than Codex.
- Shared Hookify authoring should target the real overlap, not the union of every possible event.

## Companion skill

- Use [hookify](../hookify/SKILL.md) when the task is broader than authoring a single hook file.
