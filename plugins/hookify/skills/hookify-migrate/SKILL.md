---
name: hookify-migrate
description: Migrate existing Claude or Codex hook setups toward Hookify conventions. Use when the user wants to consolidate old hook files, translate existing policies into `.all`, `.claude`, or `.codex` hook files, or reduce duplicated cross-agent hook logic.
metadata:
  short-description: Migrate hooks into Hookify
---

# Hookify Migrate

Use this skill when the task is to move an existing hook setup toward Hookify conventions.

## Quick start

1. Inspect the current hook surfaces before planning the migration.
2. Identify which existing behaviors are:
   - truly shared
   - Claude-only
   - Codex-only
3. Preserve behavior first. Cleanup and deduplication come second.
4. Translate the result into explicit `.all`, `.claude`, and `.codex` placements.

## Migration workflow

### 1. Build the inventory

Inspect:

- Claude user and project hook config
- Codex user and project hook config
- any existing `.hookify/` trees
- plugin-bundled hook config if present

### 2. Group by meaning, not by source file

Separate current behavior into:

- shared policy
- Claude-only lifecycle or permission behavior
- Codex-only behavior

### 3. Preserve intent

Do not rewrite semantics just to make the tree look tidy. The goal is a faithful migration first.

### 4. Make applicability explicit

After grouping:

- shared behavior becomes `.all`
- Claude-only behavior becomes `.claude`
- Codex-only behavior becomes `.codex`

## References

- Read `../hookify/references/setup-surfaces.md` for where current hook config can live.
- Read `../hookify/references/hook-authoring.md` for the shared event subset and important asymmetries.
