# Distribution Strategy

This page answers a product question rather than a runtime question: how should Hookify reach users?

## Current Platform Reality

| Surface                             | Claude                                                                                                | Codex                                                                           | What it means for Hookify                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Native project hook registration    | Yes                                                                                                   | Yes                                                                             | Hookify should support project-local installs, not just user-level bootstrap. |
| Native user hook registration       | Yes                                                                                                   | Yes                                                                             | Hookify can still offer one-time user installs for convenience.               |
| Official plugin install surface     | Yes, but the public build and publishing story is less legible from Anthropic’s docs during this pass | Yes, with official docs for overview, local marketplaces, and plugin manifests  | Codex plugin support is a real distribution channel today.                    |
| Official local plugin testing story | Not clearly documented in the public Claude docs used for this pass                                   | Yes: repo and personal marketplaces are documented                              | Codex is the cleaner first plugin target.                                     |
| Self-serve public plugin publishing | Unclear from the public Claude docs used here                                                         | Not available yet; official docs say public directory publishing is coming soon | A plugin alone is not enough as the primary distribution plan.                |

## Recommendation

Hookify should ship in three layers.

### 1. Bun CLI as the primary product

The primary install surface should be a Bun CLI, not a marketplace.

Why:

- One command surface can install Claude support, Codex support, or both.
- The same binary can scaffold hooks, migrate old layouts, run diagnostics, and print verified event docs locally.
- Hookify stays a product with its own identity instead of becoming an implementation detail inside someone else’s marketplace naming scheme.
- The CLI can stay useful even when a plugin directory changes policy or lags behind the runtime.

The minimum command set should be:

```text
hookify install codex
hookify install claude
hookify install all
hookify scaffold hook
hookify scaffold rule
hookify doctor
hookify explain <agent> <event>
```

### 2. Codex plugin as an optional install surface

Codex’s current plugin model is good enough to treat as a first-class secondary channel.

Verified from the official Codex docs:

- Plugins bundle reusable workflows for Codex and can include skills, app integrations, and MCP servers.
- Local plugin testing is documented with repo marketplaces at `$REPO_ROOT/.agents/plugins/marketplace.json` and personal marketplaces at `~/.agents/plugins/marketplace.json`.
- Plugins are installed through the Codex app or CLI plugin directory.
- `.codex-plugin/plugin.json` is the required manifest entry point.
- Self-serve public plugin publishing is not available yet; official docs say it is coming soon.

One useful nuance from local shipped plugins: current plugin examples and plugin specs also include plugin-level hooks, even though the public build page emphasizes skills, apps, and MCP first. Hookify should take advantage of that when the runtime package exists, but should still treat the CLI as the durable install story.

### 3. Claude plugin or marketplace wrapper as an optional channel

Hookify should support Claude plugin packaging, but it should not depend on Anthropic marketplace identity to exist.

The public Claude hooks docs explicitly acknowledge plugin-bundled hooks via `hooks/hooks.json`. That is enough to justify a Claude plugin wrapper. What is less clear from the public docs used in this pass is the full self-serve build, publish, and directory-management story equivalent to Codex’s current plugin docs.

That leads to one design recommendation:

- Keep the core repo and CLI product named `hookify`.
- If you publish a Claude marketplace entry, publish it as `Hookify`, not as one item inside a personal omnibus marketplace.
- Treat the marketplace entry as a thin installer and updater for the same Hookify runtime, not as a separate product.

## Practical Packaging Shape

The clean packaging layout is:

```text
hookify/
  packages/
    schema/
    core/
    adapter-claude/
    adapter-codex/
    runtime/
    cli/
  plugins/
    codex-hookify/
    claude-hookify/
```

Where:

- `runtime` owns discovery, execution, process spawning, and translation between handlers and agent adapters.
- `cli` owns install, scaffold, doctor, and explain commands.
- `plugins/codex-hookify` is a thin Codex-facing distribution wrapper around the runtime and CLI.
- `plugins/claude-hookify` is a thin Claude-facing wrapper if marketplace distribution is worth the extra maintenance.

## Advice on the Claude Part

If the marketplace identity feels awkward under your personal name, that is a signal to avoid making the marketplace the center of gravity.

The cleaner shape is:

- product identity: `Hookify`
- primary install path: `bunx hookify install ...`
- optional marketplace/plugin identities: thin wrappers named `Hookify` for each agent ecosystem

That keeps the runtime, docs, CLI, and repo all centered on one product name. It also means you can publish other skills or tools later without forcing them into the same marketplace bucket as Hookify.

## What This Means Next

The next implementation steps are:

1. Add `packages/runtime` so Hookify can actually discover and execute `.all`, `.claude`, and `.codex` hooks.
2. Add `packages/cli` with `install`, `scaffold`, and `doctor`.
3. Dogfood a local Codex plugin wrapper using a personal marketplace.
4. Add a Claude wrapper only after the runtime and CLI are stable enough that the wrapper stays thin.
