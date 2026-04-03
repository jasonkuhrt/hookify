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
- The Codex plugin wrapper in this repo already bundles both skills and plugin-level hooks.
- The repo also ships a source-first Claude dispatcher and sample `hooks/hooks.json` wiring under `integrations/claude/hooks/`.
- Codex still has the cleaner documented plugin/testing story today.
- Claude packaging should stay thin and reuse the same runtime and skill model.
