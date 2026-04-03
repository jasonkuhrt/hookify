# Hookify event map

Use this file when deciding where a new Hookify rule belongs.

## Shared events

- `session-start`
- `user-prompt-submit`
- `pre-tool-use`
- `post-tool-use`
- `stop`

## Best uses

- `pre-tool-use`: prevent a command or tool call before execution
- `post-tool-use`: inspect completed output and feed back warnings or continuation text
- `session-start`: inject startup context
- `user-prompt-submit`: shape model behavior before the turn begins
- `stop`: require one more pass instead of letting the session end

## Common examples

- Block `cmux`: `pre-tool-use`
- Warn on suspicious command output: `post-tool-use`
- Remind the agent about repo conventions: `session-start`
- Stop unsafe prompts before they run: `user-prompt-submit`
- Prevent premature completion: `stop`
