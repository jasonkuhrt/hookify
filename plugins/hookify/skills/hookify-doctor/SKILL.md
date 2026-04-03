---
name: hookify-doctor
description: Diagnose Hookify configuration and behavior. Use when the user wants to know why a Hookify rule is not firing, why a hook is loading from the wrong scope, whether Claude and Codex are seeing the same policy, or what gap remains in the current platform surface.
metadata:
  short-description: Diagnose Hookify config and behavior
---

# Hookify Doctor

Use this skill when the task is troubleshooting.

## Quick start

1. Reproduce the symptom with the real current config.
2. Identify the active scope:
   - user
   - project
   - plugin
3. Check whether the issue is:
   - discovery
   - event mismatch
   - payload mismatch
   - unsupported output/control surface
   - platform gap

## Diagnostic workflow

### 1. Verify hook placement

Inspect the actual files that should be loading for the target agent and scope. Include symlinks and realpaths.

### 2. Verify event choice

Check whether the chosen event is one the target agent actually emits, and whether the matcher applies on that event.

### 3. Verify control surface

Check whether the target agent can really do what the hook is trying to do:

- add context
- block
- continue
- ask for approval

Do not treat parsed-but-unsupported fields as working behavior.

### 4. Identify true gaps

If the platform cannot enforce the requested behavior, say so clearly and name the remaining gap instead of hiding it behind workaround language.

## References

- Read `../hookify/references/hook-authoring.md` for the shared event subset and asymmetries.
- Read `../hookify-write-hook/references/event-map.md` when the problem might be the wrong event choice.
