# Distribution Strategy

This page answers a product question rather than a runtime question: how should Hookify reach users?

## Current Platform Reality

| Surface                             | Claude                                                                                                | Codex                                                                           | What it means for Hookify                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Native project hook registration    | Yes                                                                                                   | Yes                                                                             | Hookify should support project-local installs, not just user-level bootstrap. |
| Native user hook registration       | Yes                                                                                                   | Yes                                                                             | Hookify can still offer one-time user installs for convenience.               |
| Official plugin install surface     | Yes, but the public build and publishing story is less legible from Anthropic’s docs during this pass | Yes, with official docs for overview, local marketplaces, and plugin manifests  | Plugin packaging is the right distribution shape, especially for Codex.       |
| Official local plugin testing story | Not clearly documented in the public Claude docs used for this pass                                   | Yes: repo and personal marketplaces are documented                              | Codex is the cleaner first plugin target.                                     |
| Self-serve public plugin publishing | Unclear from the public Claude docs used here                                                         | Not available yet; official docs say public directory publishing is coming soon | Hookify should be installable without depending on a public directory.        |
| Skill packaging inside plugins      | Yes, via plugin-bundled hooks and related component packaging                                         | Yes, first-class plugin bundle surface                                          | Skills are the right user-facing entrypoint.                                  |

## Recommendation

Hookify should ship in three layers.

### 1. Skills as the primary user interface

The primary way people should use Hookify is by talking to bundled Hookify skills.

Why:

- Users should be able to say what they want in natural language: learn Hookify, inspect their current hook setup, migrate an existing layout, or add a new rule.
- Skills are a better fit than a CLI for explaining cross-agent differences and choosing between user-level and project-level installs.
- Skills let Hookify stay close to the runtime and docs instead of inventing a second command language for a problem that is already conversational.
- The same Hookify runtime can sit underneath multiple skills without exposing runtime details in every user-facing prompt.

The first skill set should cover:

```text
hookify
hookify-write-hook
hookify-migrate
hookify-doctor
```

`hookify` is the general entry skill. The others exist so power users can be explicit when they want authoring, migration, or diagnostics.

### 2. Codex plugin as the first packaged install surface

Codex’s current plugin model is good enough to treat as the first real packaged channel.

Verified from the official Codex docs:

- Plugins bundle reusable workflows for Codex and can include skills, app integrations, and MCP servers.
- Local plugin testing is documented with repo marketplaces at `$REPO_ROOT/.agents/plugins/marketplace.json` and personal marketplaces at `~/.agents/plugins/marketplace.json`.
- Plugins are installed through the Codex app or CLI plugin directory.
- `.codex-plugin/plugin.json` is the required manifest entry point.
- Self-serve public plugin publishing is not available yet; official docs say it is coming soon.

One useful nuance from local shipped plugins: current plugin examples and plugin specs also include plugin-level hooks, even though the public build page emphasizes skills, apps, and MCP first. Hookify now takes advantage of that in the source-first Codex plugin wrapper, while keeping the skill layer as the human-facing entrypoint.

### 3. Claude plugin or marketplace wrapper as the paired channel

Hookify should support Claude plugin packaging, but it should not depend on Anthropic marketplace identity to exist.

The public Claude hooks docs explicitly acknowledge plugin-bundled hooks via `hooks/hooks.json`. That is enough to justify a Claude plugin wrapper. What is less clear from the public docs used in this pass is the full self-serve build, publish, and directory-management story equivalent to Codex’s current plugin docs.

That leads to one design recommendation:

- Keep the core repo and product named `hookify`.
- If you publish a Claude marketplace entry, publish it as `Hookify`, not as one item inside a personal omnibus marketplace.
- Treat the marketplace entry as a thin wrapper around the same Hookify runtime and bundled skills, not as a separate product.

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
    install/
    integration-codex/
    integration-claude/
  plugins/
    hookify/
      .codex-plugin/
      hooks.json
      hooks/
      skills/
        hookify/
        hookify-write-hook/
        hookify-migrate/
        hookify-doctor/
    hookify-claude/
      .claude-plugin/
      hooks/
      skills/
  integrations/
    claude/
      hooks/
```

Where:

- `runtime` owns root resolution, discovery, execution, process spawning, and result aggregation.
- `install` owns generated native install artifacts such as dispatcher source files and native hook config JSON, including provenance banners in generated hook code.
- `integration-codex` is the Codex-facing code layer that feeds native Codex events into the runtime and translates results back out.
- `integration-claude` is the Claude-facing code layer that feeds native Claude events into the runtime and translates results back out.
- `plugins/hookify` is the Codex-facing distribution wrapper around the runtime, the Codex integration, and the bundled Hookify skills.
- `plugins/hookify-claude` is the source-first Claude plugin wrapper around the Claude integration and the shared Hookify skills.
- `integrations/claude` holds the source-first Claude dispatcher and sample `hooks/hooks.json` wiring until a fuller Claude plugin wrapper is worth the extra maintenance.

## Advice on the Claude Part

If the marketplace identity feels awkward under your personal name, that is a signal to avoid making the marketplace the center of gravity.

The cleaner shape is:

- product identity: `Hookify`
- primary interface: bundled Hookify skills
- optional marketplace/plugin identities: thin wrappers named `Hookify` for each agent ecosystem

That keeps the runtime, skills, docs, and repo all centered on one product name. It also means you can publish other skills or tools later without forcing them into the same marketplace bucket as Hookify.

## What This Means Next

The next implementation steps are:

1. Dogfood both source-first plugin wrappers against real project hooks.
2. Decide whether the current source-import wrappers should stay source-first for development and gain a separate publish step later.
3. Tighten the Claude plugin wrapper from “minimal but real” into a fuller distribution surface with any Claude-specific commands or docs it still needs.
