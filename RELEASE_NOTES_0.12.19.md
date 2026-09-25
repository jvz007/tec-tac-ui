# Tec-Tac UI 0.12.19

## Tec-Tac MFA issuer URL

- TOTP enrollment now uses the actual Tec-Tac UI base URL as the authenticator issuer instead of Tactical's first configured CORS origin.
- The browser derives the issuer from the current origin plus Tec-Tac's configured Vite base path (`/tec-tac/`).
- The manual `otpauth://` URI is rebuilt with that UI URL while Tactical continues to provide the TOTP secret.
- The QR request sends the same UI URL to Core so QR and manual enrollment use an identical issuer.
