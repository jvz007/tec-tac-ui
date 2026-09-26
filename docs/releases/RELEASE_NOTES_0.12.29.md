# Tec-Tac UI 0.12.29

## MFA recovery lifecycle in Access

- Added selected-user MFA/recovery status to Access → Users: TOTP state, recovery-set state, available/used counts and last generation time.
- Older accounts with TOTP but no recovery codes are now shown explicitly as `not created`; users can create their first set from Access → MFA & recovery.
- Added administrator invalidation of an existing recovery-code set using the Core 1.15.60 account-security endpoint.
- Administrators cannot create, rotate, reveal or retrieve another user's recovery codes.
- Protected/root accounts surface the Core restriction when the current administrator lacks effective superuser authority.
- Reset 2FA now refreshes recovery status and explains that codes bound to the previous authenticator are no longer valid.
- Renamed self-service `Regenerate backup codes` to `Rotate backup codes` and clarified the atomic invalidation consequence.
