# Tec-Tac UI 0.2.3

## Tactical-native TOTP enrollment

Tec-Tac now completes first-time Tactical TOTP enrollment inside the Tec-Tac sign-in flow instead of redirecting the operator to Tactical's `/totp_setup` page.

### Authentication flow

- `POST /v2/checkcreds/` remains the credential preflight.
- Existing TOTP users continue to verify through `POST /v2/login/`.
- Accounts without a TOTP secret use the short-lived token returned by Tactical only for `POST /accounts/users/setup_totp/`.
- Tec-Tac displays Tactical's returned manual setup key and `otpauth://` provisioning URI.
- The user enters the newly generated authenticator code and Tec-Tac completes sign-in through Tactical's normal `/v2/login/` endpoint.
- No Tec-Tac user, password, TOTP secret, or parallel MFA database is introduced.

### Setup-token safety

The short-lived token returned by Tactical before TOTP enrollment is marked as `totp-setup` in browser storage. It is never accepted as a normal Tec-Tac session. Reloading or abandoning enrollment clears it and requires the credential flow again.

### UI

The setup state follows the existing Tec-Tac authentication gate and supports dark, light, and high-contrast themes. Manual secret entry is always available, and compatible local authenticator handlers may be opened using Tactical's returned `otpauth://` URI.
