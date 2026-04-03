# Hookify hook authoring reference

Use this file when you need the verified cross-agent subset.

## Shared normalized events

- `session-start`
- `user-prompt-submit`
- `pre-tool-use`
- `post-tool-use`
- `stop`

## Current best interception points

- Block a Bash command before execution: `pre-tool-use`
- Add guidance before the model sees a user prompt: `user-prompt-submit`
- Add feedback after a command already ran: `post-tool-use`
- Continue instead of stopping: `stop`

## Shared high-value fields

- `session_id`
- `transcript_path`
- `cwd`
- `hook_event_name`
- `turn_id` on turn-scoped events
- `prompt` on `user-prompt-submit`
- `tool_name`, `tool_input`, and `tool_response` on tool events
- `last_assistant_message` and `stop_hook_active` on `stop`

## Important asymmetries

- Claude exposes many more lifecycle and permission events than Codex.
- Codex currently documents repo-level and user-level `hooks.json` loading.
- Codex currently documents Bash-only interception for `pre-tool-use` and `post-tool-use`.
- Claude supports richer permission decisions such as `allow`, `ask`, and `defer`; Codex does not currently document those as working.

## Shared safe assumptions for Hookify

- Preserve raw native payloads.
- Normalize only the subset with stable shared meaning.
- Treat `.all`, `.claude`, and `.codex` as equally valid authoring choices.
