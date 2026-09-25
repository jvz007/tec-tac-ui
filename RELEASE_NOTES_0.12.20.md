# Tec-Tac UI 0.12.20

## MFA issuer hardening

- Uses a colon-free authenticator issuer derived from the actual Tec-Tac UI hostname and `/tec-tac` path.
- Keeps the manual `otpauth://` enrollment URI aligned with Core QR generation while continuing to send the full UI URL to Core for origin validation.
- No authentication authority changes: Tactical remains the TOTP secret and verification authority.
