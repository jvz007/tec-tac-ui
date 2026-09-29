# My Account

My Account contains self-service controls for the currently signed-in Tactical user.

## Change password

Local users can change their own password by proving the current password first. The new password must pass Tactical/Django password validation. After a successful change, Tec-Tac revokes every other active Tactical/Tec-Tac session and keeps the current browser signed in.

SSO-managed accounts change their password through the identity provider instead.

## Reset and re-enrol two-factor authentication

For local users with TOTP already configured, reset requires both the current password and a current authenticator code. A successful reset invalidates Tec-Tac backup codes and signs out every active session. Sign in again normally; the standard Tec-Tac enrollment flow will then issue a fresh authenticator seed.

## Sign out other sessions

Use **Sign out my other sessions** to revoke all other Tactical Knox credentials and Tec-Tac trust sessions while preserving the current browser session.

## Tactical agent action

The Tactical agent double-click preference is stored on the Tactical user account, not in Tec-Tac preferences. Available actions come from the installed Tactical version. If **URL Action** is selected, choose the default URL Action from the list allowed by your Tactical role.
