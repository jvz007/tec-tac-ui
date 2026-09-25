# Tec-Tac UI 0.12.18

## MFA recovery

- Adds **MFA & recovery** to Access Management.
- Users can generate/regenerate 10 one-time backup codes after proving their current password and authenticator code.
- Recovery codes are shown only once with Copy all and local `.txt` download actions.
- Sign-in now offers **Use backup code** as an alternative to the authenticator code for accounts with generated recovery codes.

## Admin login sessions

- Adds an administrator-only **Login sessions** Access tab when the current identity has Tactical account-management authority.
- Lists active Tactical sessions with creation/expiry data and Tec-Tac last-activity/IP enrichment when available.
- Supports individual session revocation and revoke-all-for-user actions with explicit confirmation.
- Makes clear that revocation deletes the Tactical Knox login token, so the session stops authenticating in both Tactical and Tec-Tac.
