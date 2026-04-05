# Distribution Strategy

This page describes how Hookify ships to users today and how that should evolve.

## Current State

Hookify ships as one native plugin per agent. Each plugin is a self-contained directory in this repo with a bundled Node-compatible dispatcher, so no runtime import reaches into the monorepo once the plugin is installed.

| Agent  | Plugin directory          | Marketplace manifest                      | Install flow                                                                |
| ------ | ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| Claude | `plugins/hookify-claude/` | `.claude-plugin/marketplace.json` (root)  | Remote: `/plugin marketplace add jasonkuhrt/hookify`                        |
| Codex  | `plugins/hookify/`        | `.agents/plugins/marketplace.json` (root) | Local: clone the repo, then `npx hookify install codex` to register locally |

Both dispatchers are bundled with `bun run build:plugins` and committed to the repo. The bundle is checked for staleness as part of `bun run check`.

## Platform Constraint: Codex Remote Distribution

Codex does not yet support remote plugin marketplaces. Per the official Codex docs, "self-serve public plugin publishing is not available yet". Today the Codex install path requires:

1. Cloning this repo to a known location (suggested: `~/.local/share/hookify`).
2. Registering the repo's `.agents/plugins/marketplace.json` into the user's personal marketplace at `~/.agents/plugins/marketplace.json` (what `npx hookify install codex` does).
3. Enabling the plugin in `~/.codex/config.toml`.

When Codex ships remote marketplace support, this collapses to a single CLI command equivalent to Claude's `/plugin marketplace add`.

## Why Self-Contained Plugins Matter

Before self-contained plugins, installing required `HOOKIFY_REPO_DIR`, generated marketplaces, rewriting dispatcher import paths, and mutating `~/.claude/settings.json` by hand. That coupled installed plugins to the on-disk monorepo and pushed environment management onto users.

Self-contained plugins flip this: the plugin directory ships with a single `.mjs` bundle that the agent invokes via `node`. No env vars, no post-install codegen, no workspace-imports-at-hook-time. The repo continues to own development, builds, and CI, but end users interact with the native plugin surface of their agent.

## Packaging Layout

```text
hookify/
  .claude-plugin/
    marketplace.json          # Claude marketplace — root of repo
  .agents/plugins/
    marketplace.json          # Codex repo marketplace — installer registers into ~/.agents/plugins/
  packages/
    schema/                   # versioned data contract
    core/                     # filename parsing, markdown handler parsing, env projection
    runtime/                  # discovery, execution (subprocess + markdown), result aggregation
    adapter-claude/           # Claude event → envelope, result → Claude output
    adapter-codex/            # Codex event → envelope, result → Codex output
    integration-claude/       # end-to-end Claude path
    integration-codex/        # end-to-end Codex path
    install/                  # Codex installer (local bootstrap); Claude installer removed
    cli/                      # `npx hookify install` CLI entrypoint
  plugins/
    hookify-claude/           # Claude Code plugin
      .claude-plugin/plugin.json
      hooks/
        hooks.json            # invokes node dispatch-claude.mjs
        dispatch-claude.ts    # source
        dispatch-claude.mjs   # bundled (committed)
      skills/                 # symlink to plugins/hookify/skills
    hookify/                  # Codex plugin
      .codex-plugin/plugin.json
      hooks.json              # invokes node dispatch-codex.mjs
      hooks/
        dispatch-codex.ts     # source
        dispatch-codex.mjs    # bundled (committed)
      skills/
      agents/
```

## What's Next

1. Watch for Codex remote plugin marketplace support and collapse the Codex install flow to a single command when it ships.
2. Consider a CI release workflow that rebuilds bundles on tag push rather than relying on contributors to run `bun run build:plugins` before committing.
3. Expand the bundled skills surface (authoring, migration, diagnostics) as the skills-first user interface matures.
