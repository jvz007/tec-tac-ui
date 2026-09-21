# Tec-Tac UI 0.11.7

## Core interactive session security

- Adds shell-owned meaningful-activity tracking for Core session idle policy.
- Reads `activity_heartbeat_seconds` from Core and sends throttled activity heartbeats only after real user interaction.
- Background polling does not refresh user activity.
- Adds global handling for Core idle, absolute-expiry, IP-change, revocation and invalid-state failures.
- Core session failures retire the local Tactical credential and return the shell to sign-in consistently.
- Keeps session enforcement independent from the optional `coreusersecurity` module.
