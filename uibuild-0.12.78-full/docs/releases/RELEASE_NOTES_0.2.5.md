# Tec-Tac UI 0.2.5

## Authenticator enrollment layout

0.2.5 improves the first-login TOTP enrollment screen introduced in 0.2.4.

- Changes the enrollment area from two columns to two stacked rows.
- Makes the QR code the primary action and increases it to a maximum of 320px.
- Moves the manual setup key below the QR code as the fallback path.
- Keeps the existing local QR generation, manual key, authenticator URI, and Tactical verification flow unchanged.
- Preserves dark, light, and high-contrast theme behavior.

No backend change is required beyond Tec-Tac framework 1.2.5 already required by UI 0.2.4.
