# Writing Hooks for Claude and Codex

Hookify keeps both `native` and `normalized` data because the overlap between Claude and Codex is useful but incomplete. This page is the source-of-truth map for authors who want to understand what each agent calls an event, what JSON arrives on `stdin`, and what control surface is available on `stdout`.

## Official References

- Claude Code hooks guide: [code.claude.com/docs/en/hooks-guide](https://code.claude.com/docs/en/hooks-guide)
- Claude Code hooks reference: [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
- Codex hooks: [developers.openai.com/codex/hooks](https://developers.openai.com/codex/hooks)
- Codex plugins overview: [developers.openai.com/codex/plugins](https://developers.openai.com/codex/plugins)
- Codex build plugins: [developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build)

## Where Hooks Live

| Surface                             | Claude                                               | Codex                                                                                          | Notes                                                                                                       |
| ----------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| User-level hooks                    | `~/.claude/settings.json`                            | `~/.codex/hooks.json`                                                                          | Both are machine-local.                                                                                     |
| Project hooks committed to the repo | `.claude/settings.json`                              | `<repo>/.codex/hooks.json`                                                                     | Both are shareable. Codex merges repo and user `hooks.json` files rather than replacing one with the other. |
| Project-local uncommitted hooks     | `.claude/settings.local.json`                        | No documented equivalent                                                                       | Codex currently documents user and repo layers, not a separate repo-local gitignored layer.                 |
| Plugin-bundled hooks                | Plugin `hooks/hooks.json` when the plugin is enabled | Plugin `hooks.json` is used in shipped local plugin examples and accepted by current manifests | Codex public docs emphasize skills, apps, and MCP; current shipped plugin examples also include hooks.      |
| Skill or agent scoped hooks         | Skill or agent frontmatter can carry hooks           | Not documented as a native package surface                                                     | Hookify should not assume this parity exists.                                                               |

## Shared Event Matrix

These are the events Hookify can normalize across both agents today.

| Hookify event        | Claude             | Codex              | Control                      | Notes                                                                                                                       |
| -------------------- | ------------------ | ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `session-start`      | `SessionStart`     | `SessionStart`     | Context injection            | Claude documents `source` values `startup`, `resume`, `clear`, `compact`. Codex currently documents `startup` and `resume`. |
| `user-prompt-submit` | `UserPromptSubmit` | `UserPromptSubmit` | Context injection or block   | Good interception point for prompt policy before the model acts.                                                            |
| `pre-tool-use`       | `PreToolUse`       | `PreToolUse`       | Block before execution       | Best interception point for command policies like blocking `cmux`. Codex currently only emits Bash here.                    |
| `post-tool-use`      | `PostToolUse`      | `PostToolUse`      | Feedback after execution     | Side effects already happened. Use for review, warnings, or continuation logic.                                             |
| `stop`               | `Stop`             | `Stop`             | Continue instead of stopping | Both agents can turn a stop into another round of work.                                                                     |

## Claude-Only Events

Claude exposes a much larger hook surface today.

| Hookify view | Claude event         | Control                        | Notes                                                      |
| ------------ | -------------------- | ------------------------------ | ---------------------------------------------------------- |
| Claude-only  | `PermissionRequest`  | Approve, deny, or ask          | Lets hooks answer permission dialogs.                      |
| Claude-only  | `PermissionDenied`   | Retry signal                   | Fires when Claude’s auto mode denies a tool call.          |
| Claude-only  | `PostToolUseFailure` | Feedback only                  | Fires after a tool fails.                                  |
| Claude-only  | `Notification`       | Notification handling          | Useful for desktop or tmux-style side effects.             |
| Claude-only  | `SubagentStart`      | Context injection              | Fires when Claude spawns a subagent.                       |
| Claude-only  | `SubagentStop`       | Continue instead of stopping   | Similar to `Stop`, but for subagents.                      |
| Claude-only  | `TaskCreated`        | Block or stop teammate         | For task systems.                                          |
| Claude-only  | `TaskCompleted`      | Block or stop teammate         | For task completion policy.                                |
| Claude-only  | `StopFailure`        | Observe only                   | Output is ignored.                                         |
| Claude-only  | `TeammateIdle`       | Observe only                   | Team workflow surface.                                     |
| Claude-only  | `InstructionsLoaded` | Observe only                   | Fires when `CLAUDE.md` or `.claude/rules/*.md` files load. |
| Claude-only  | `ConfigChange`       | Observe only                   | Reacts to settings changes.                                |
| Claude-only  | `CwdChanged`         | Context and env updates        | Useful for direnv-style workflows.                         |
| Claude-only  | `FileChanged`        | Observe only                   | Watches selected filenames.                                |
| Claude-only  | `WorktreeCreate`     | Replace default behavior       | Claude-specific worktree lifecycle.                        |
| Claude-only  | `WorktreeRemove`     | Observe only                   | Cleanup surface.                                           |
| Claude-only  | `PreCompact`         | Observe only                   | Before compaction.                                         |
| Claude-only  | `PostCompact`        | Observe only                   | After compaction.                                          |
| Claude-only  | `Elicitation`        | Answer MCP user-input requests | Hooks can respond programmatically.                        |
| Claude-only  | `ElicitationResult`  | Observe only                   | Fires after elicitation completes.                         |
| Claude-only  | `SessionEnd`         | Observe only                   | Cleanup on session termination.                            |

## Payload Mapping

These are the fields Hookify should normalize first. Anything else stays available under `native`.

| Hookify location                    | Claude native field             | Codex native field              | Notes                                                                                                         |
| ----------------------------------- | ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `meta.sessionId`                    | `session_id`                    | `session_id`                    | Shared across all documented events.                                                                          |
| `meta.transcriptPath`               | `transcript_path`               | `transcript_path`               | Shared across all documented events.                                                                          |
| `meta.cwd`                          | `cwd`                           | `cwd`                           | Shared across all documented events.                                                                          |
| `event`                             | `hook_event_name`               | `hook_event_name`               | Native event name is preserved under `native`.                                                                |
| `meta.turnId`                       | `turn_id` on turn-scoped events | `turn_id` on turn-scoped events | Not every event includes it.                                                                                  |
| `normalized.session.source`         | `source` on `SessionStart`      | `source` on `SessionStart`      | Claude documents more source values than Codex today.                                                         |
| `normalized.prompt.text`            | `prompt`                        | `prompt`                        | Used by `UserPromptSubmit`.                                                                                   |
| `normalized.tool.name`              | `tool_name`                     | `tool_name`                     | Claude supports many built-in and MCP tools. Codex currently emits `Bash` for `PreToolUse` and `PostToolUse`. |
| `normalized.tool.input`             | `tool_input`                    | `tool_input`                    | Hookify should not erase tool-specific fields.                                                                |
| `normalized.tool.command`           | `tool_input.command` for Bash   | `tool_input.command` for Bash   | The field that matters for command guards like `\\bcmux\\b`.                                                  |
| `normalized.tool.response`          | `tool_response`                 | `tool_response`                 | Present on `PostToolUse`.                                                                                     |
| `normalized.session.stopHookActive` | `stop_hook_active`              | `stop_hook_active`              | Present on `Stop` and some Claude subagent/task surfaces.                                                     |
| `normalized.assistant.lastMessage`  | `last_assistant_message`        | `last_assistant_message`        | Present on `Stop`; Claude also uses it on some subagent and failure events.                                   |

Hookify should expect extra fields that are not yet normalized. Examples include Claude’s `permission_mode`, `agent_type`, `error`, and file-watcher fields, plus Codex fields that appear in the current client before they are fully documented.

## Hookify Handler Output

This is the Hookify-native JSON contract a handler should print when it wants structured control:

```json
{
  "decision": "block",
  "reason": "Explanation for the block",
  "additionalContext": "Extra context to inject when the event supports it",
  "systemMessage": "Warning shown to the user"
}
```

Field meaning:

| Hookify field       | Meaning                                                                                 | Notes                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `decision`          | `block` means the handler wants to prevent the action when the native event supports it | Omit or use `allow` to permit normal execution                        |
| `reason`            | Explanation paired with `decision: "block"`                                             | Required for Hookify block results                                    |
| `additionalContext` | Extra model context                                                                     | Adapters translate this into each agent’s event-specific context path |
| `systemMessage`     | Warning shown to the user                                                               | Adapters preserve this when the native event supports warnings        |

If a Hookify handler prints plain text instead of JSON, the runtime currently treats that as a fail-open `systemMessage` convenience rather than native-agent plain-text semantics.

## Output and Control Matrix

| Goal                                  | Claude                                                                                       | Codex                                                                                                                      | Notes                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Add context at session start          | Exit `0` and print plain text to `stdout`, or JSON `hookSpecificOutput.additionalContext`    | Exit `0` and print plain text to `stdout`, or JSON `hookSpecificOutput.additionalContext`                                  | Good shared Hookify surface.                                                            |
| Add context before prompt processing  | `UserPromptSubmit` plain text `stdout` or JSON `additionalContext`                           | `UserPromptSubmit` plain text `stdout` or JSON `additionalContext`                                                         | Shared Hookify surface.                                                                 |
| Block a user prompt                   | Exit `2` with `stderr`, or JSON `{"decision":"block","reason":"..."}`                        | Exit `2` with `stderr`, or JSON `{"decision":"block","reason":"..."}`                                                      | Strong parity.                                                                          |
| Block a tool before it runs           | `PreToolUse` exit `2` with `stderr`, or JSON `hookSpecificOutput.permissionDecision: "deny"` | `PreToolUse` exit `2` with `stderr`, or JSON `hookSpecificOutput.permissionDecision: "deny"` or legacy `decision: "block"` | Claude also supports `allow`, `ask`, and `defer`. Codex currently does not.             |
| Force an approval dialog              | `PreToolUse` JSON `permissionDecision: "ask"`                                                | Not supported                                                                                                              | Claude-only affordance.                                                                 |
| Auto-approve a tool call              | `PreToolUse` JSON `permissionDecision: "allow"` or `PermissionRequest` decision control      | Not supported today                                                                                                        | Codex parses some allow-style fields but currently fails open instead of honoring them. |
| Add feedback after a tool already ran | `PostToolUse` JSON `decision: "block"` and `additionalContext`                               | `PostToolUse` JSON `decision: "block"` and `additionalContext`                                                             | In both agents the command already executed. This is feedback, not rollback.            |
| Continue instead of stopping          | `Stop` JSON `{"decision":"block","reason":"..."}`                                            | `Stop` JSON `{"decision":"block","reason":"..."}`                                                                          | Same intent, different implementation details under the hood.                           |
| Use plain text `stdout` on `Stop`     | Not the main path; JSON is the documented structured control                                 | Invalid when exit code is `0`                                                                                              | Codex `Stop` is stricter here.                                                          |

## Practical Guidance for Hookify

- Normalize the shared subset aggressively: `session-start`, `user-prompt-submit`, `pre-tool-use`, `post-tool-use`, and `stop`.
- Preserve every native payload untouched under `native`.
- Treat Bash command interception as a first-class shared capability.
- Do not pretend Claude’s richer permission and lifecycle surfaces exist in Codex.
- For Codex, assume Bash-only tool interception until the public docs and runtime say otherwise.
- For plugins, keep Hookify’s own hook runtime neutral even if one agent’s distribution surface is richer than the other’s.
