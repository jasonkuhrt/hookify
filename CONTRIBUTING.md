# Contributing to Hookify

## Getting Started

Clone the repo or add a worktree, then run:

```sh
bun install
bun run check
```

That is the full local setup today. There are no required environment variables, external services, or repo hooks. Before opening a pull request, rerun `bun run check` from the workspace root so formatting, lint, and tests match what reviewers will expect.

## Codebase Map

Hookify is a small Bun workspace. Root files define the shared toolchain, and each package owns one layer of the design.

| Path                                                              | Role                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`package.json`](package.json)                                    | Workspace scripts and shared dev dependencies                                                                                                       |
| [`bunfig.toml`](bunfig.toml)                                      | Bun install and run defaults                                                                                                                        |
| [`tsconfig.base.json`](tsconfig.base.json)                        | Shared TypeScript settings for every package                                                                                                        |
| [`README.md`](README.md)                                          | User-facing model and glossary for [`event`](README.md#event), [`scope`](README.md#scope), [`envelope`](README.md#envelope), and other shared terms |
| [`docs/`](docs/hook-authoring.md)                                 | Deep reference docs such as cross-agent hook authoring and distribution strategy                                                                    |
| [`packages/schema`](packages/schema/src/index.ts)                 | Versioned [`envelope`](README.md#envelope) and result contract                                                                                      |
| [`packages/core`](packages/core/src/index.ts)                     | Neutral mechanics such as filename parsing and env projection                                                                                       |
| [`packages/adapter-codex`](packages/adapter-codex/src/index.ts)   | Codex-native event typing, normalization, and response translation                                                                                  |
| [`packages/adapter-claude`](packages/adapter-claude/src/index.ts) | Claude-native event typing and normalization bootstrap                                                                                              |

Tests live next to the code they protect as `src/*.test.ts`. If you are changing behavior, start in the package that owns that behavior and extend its local test file first.

## Boundaries

`@hookify/schema` owns the public contract and knows nothing about filesystem discovery, shell execution, or agent-specific quirks. If a change can be named without mentioning Claude or Codex, it probably belongs here.

`@hookify/core` owns agent-neutral mechanics. It can depend on [`envelope`](README.md#envelope) and other schema types, but it should not learn native field names or absorb adapter behavior.

`@hookify/adapter-codex` and `@hookify/adapter-claude` own native payload knowledge. Adapters may depend on schema types and later on neutral helpers from core, but they should not depend on each other or hide policy decisions that belong in the runtime.

When the executable runtime package lands, it should depend inward on schema, core, and adapters. Do not push execution or discovery concerns back down into schema or adapter packages.

## Extension Points

To add a new agent, create `packages/adapter-<agent>` and keep all native event names, native payload types, and native response translation inside that package. The rest of the workspace should only see the shared [`envelope`](README.md#envelope) and Hookify result types.

To grow the shared contract, start in `@hookify/schema`. Add a field only when its meaning can be stated without agent-specific language and at least one adapter can source it from a real native payload. If the data is useful but agent-specific, keep it in the [`native payload`](README.md#native-payload) instead of stretching the [`normalized event`](README.md#normalized-event).

To grow neutral runtime behavior, add helpers to `@hookify/core` only when they apply across agents. Filename parsing, applicability checks, discovery ordering, environment projection, and future rule execution belong here. Native event-name maps and native block-output rules do not.

To grow test confidence, add fixture-style tests beside the adapter or core helper you change. The long-term direction is real captured native payloads for each agent, so favor tests that read like contract examples instead of implementation trivia.

## Key Decisions

| Decision                                                                        | Why                                                                                | Alternative rejected                                                                  |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Preserve both `native` and `normalized` in one [`envelope`](README.md#envelope) | Shared hooks need one stable contract without losing agent-specific escape hatches | A normalized-only contract that forces every uncommon field into ad hoc side channels |
| Make sharing explicit with `.all`, `.claude`, and `.codex`                      | Discovery stays deterministic and readers can see applicability from the filename  | Implicit shared-by-default conventions that hide intent                               |
| Keep adapters thin and the engine neutral                                       | One agent should not become the accidental standard for the whole system           | A runtime that bakes Claude or Codex semantics directly into core                     |
| Treat user and project [`scope`](README.md#scope) as first-class                | One small user-level install can still load live project policy                    | Re-registering project hooks at the user level every time policy changes              |
| Use a Bun workspace from day one                                                | The same runtime can cover tests, future hook execution, and contributor setup     | Mixing toolchains across packages before the design is even stable                    |

## Common Tasks

When you add or change a shared field, edit [`packages/schema/src/index.ts`](packages/schema/src/index.ts) first, then update each affected adapter and its tests. A schema change is not done until the adapters either populate it or consciously leave it absent.

When you add support for a new native hook event, start in the adapter that owns that agent. Add the native event name, define the payload type, map it to a Hookify [`event`](README.md#event), and write a test that proves the resulting [`normalized event`](README.md#normalized-event) is what the runtime should see.

When you change neutral mechanics such as filename parsing or environment projection, keep the change in `@hookify/core` and cover it with `bun:test` in the same package. If the change requires adapter edits, make those edits call the core helper rather than copy the logic.

When you fix a bug, reproduce it with a package-local test first. You can run the full suite with `bun run check`, or narrow to one area with `bun test packages/core/src` or `bun test packages/adapter-codex/src`.

When you prepare a release, run `bun run check`, review the exported surfaces of each package, and make sure README and CONTRIBUTING still describe the current shape of the repo. Hookify is pre-1.0 and package publishing is not wired yet, so keep release work at the repository level until the package boundaries stop moving.
