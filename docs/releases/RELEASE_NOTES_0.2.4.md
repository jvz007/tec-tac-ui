# Tec-Tac UI 0.2.4

## Added

- QR code display on the native Tactical TOTP enrollment screen.
- QR image is fetched from Tec-Tac framework 1.2.5 and rendered as a local SVG object URL.
- Manual setup key remains visible as the fallback path.
- Explicit QR generation failure state keeps enrollment usable rather than abandoning an already-issued TOTP secret.

## Security

The browser does not send the provisioning URI to a third-party QR service. The QR is generated on the Tactical/Tec-Tac backend and returned with no-store semantics.
