# Tec-Tac UI 0.12.38

## Account protection

- Adds **Access -> Account protection** for the Core 1.15.86 root-owned superuser-account policy.
- Account managers can see whether protection is enabled; only effective superusers can change it.
- The page clearly preserves the unconditional superuser-grant rule and distinguishes it from the optional protection setting.
- Unsaved policy changes participate in the existing Access unsaved-change guard.

## Compatibility

Requires Tec-Tac Framework `>=1.15.86,<2.0.0`.

## Review rebuild fixes

- Account Protection now uses the existing unsaved-change contract correctly: dirty-only registration, working save/discard handlers, explicit clear after load/save, and cleanup on unmount.
- Removed the nonexistent `unregisterUnsaved` import and added a regression that verifies every named `../../unsaved` import exists.
