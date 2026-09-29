# Tec-Tac UI 0.12.60

## My Account — F1 to F4

Adds the new **My Account** workspace and top-bar account shortcut.

- Change your own local Tactical password with current-password proof.
- Reset your own TOTP using current password + authenticator proof, then re-enrol through the normal sign-in flow.
- Sign out all other active Tactical/Tec-Tac sessions while keeping the current browser signed in.
- Configure Tactical's native agent double-click action and default URL Action.
- SSO-managed accounts clearly defer password/TOTP management to the identity provider.

The UI requires Core `>=1.15.167` because the self-service account routes are new in that Core release.
