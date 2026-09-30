# Tec-Tac UI 0.12.25

## One-time authenticator enrollment

- Uses Core's one-time TOTP enrollment endpoint instead of Tactical's reusable setup response plus a separate QR retrieval call.
- Requires an explicit second current-password entry after Tactical has issued the short-lived setup credential; Core does not disclose the seed from the first credential check alone.
- Renders the QR from the one-time Core response and keeps the manual setup key as the fallback without attempting a second secret retrieval.
- Clears the browser's temporary setup token immediately after Core revokes it; final verification still occurs through Tactical's normal TOTP login endpoint.
- Updates the enrollment warning to make it explicit that the seed cannot be retrieved again and an abandoned setup requires an administrator reset.
