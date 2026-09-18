# Tec-Tac UI 0.1.2

## Purpose

Add a Tec-Tac-native login flow while keeping Tactical RMM as the authentication authority.

## Changes from 0.1.1

- Added username/password sign-in against `POST /v2/checkcreds/`.
- Added TOTP sign-in against `POST /v2/login/`.
- Added `LoginPanel.vue` and wired it into the unauthenticated shell state.
- Password and TOTP values remain in component memory only and are cleared after use.
- Tactical session values are stored only after Tactical returns them.
- Existing Tactical tokens are still verified before the operational shell opens.
- Invalid/stale Tactical session values are cleared before showing the login screen.
- Accounts without TOTP enrollment are not allowed into Tec-Tac; they are directed to Tactical's `/totp_setup` flow.
- Preserved dark, light, and high-contrast themes and the existing operational UI language.
- Version bumped to `0.1.2`.

## Expected server test

```bash
cd /opt/tec-tac-ui
git pull
bash tests/foundation.sh
sudo bash scripts/install.sh
```

Browser test:

1. With no Tactical token, `/tec-tac/` should show the Tec-Tac login form.
2. Correct username/password on a TOTP-enabled account should advance to the authenticator-code step.
3. Correct TOTP should issue/store the Tactical token, reload, verify the session, and open Tec-Tac.
4. Incorrect credentials or TOTP should remain on the login flow and show an error.
5. A stale Tactical token should be cleared and should not expose the operational shell.
6. An account without TOTP enrollment should be blocked from Tec-Tac and sent to Tactical's TOTP setup page.
