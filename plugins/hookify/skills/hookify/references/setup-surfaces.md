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
- Each plugin ships a bundled Node-compatible dispatcher (`dispatch-claude.mjs` / `dispatch-codex.mjs`) so the plugin directory is fully self-contained and has no workspace imports at hook time. Rebuild the bundles with `bun run build:plugins`.
- Skills are the main user-facing entrypoint.
- The Codex plugin wrapper at `plugins/hookify/` bundles both skills and plugin-level hooks.
- The Claude plugin wrapper at `plugins/hookify-claude/` exposes the same runtime through Claude's native plugin surface.
- Claude can install remotely via `/plugin marketplace add jasonkuhrt/hookify`. Codex still requires a local clone + `npx hookify install codex` until OpenAI ships remote marketplace support.
