# Hookify setup surfaces

Use this file when the task is about where Hookify should live.

## Claude

- User-level hooks live in `~/.claude/settings.json`.
- Project hooks can live in `.claude/settings.json`.
- Project-local uncommitted hooks can live in `.claude/settings.local.json`.
- Claude docs explicitly acknowledge plugin-bundled hooks through `hooks/hooks.json`.

## Codex

- User-level hooks live in `~/.codex/hooks.json`.
- Project hooks can live in `<repo>/.codex/hooks.json`.
- Codex loads matching hooks from both user and repo surfaces.
- Codex plugins use `.codex-plugin/plugin.json`.
- Local plugin testing is documented via repo or personal marketplaces.

## Hookify packaging direction

- The runtime is shared.
- Skills are the main user-facing entrypoint.
- Codex plugin packaging is the cleanest first distribution channel.
- Claude packaging should remain a thin wrapper around the same runtime and skill model.
