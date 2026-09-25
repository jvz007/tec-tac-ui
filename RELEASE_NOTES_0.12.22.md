# Tec-Tac UI 0.12.22

## Trust-policy downgrade confirmation

- Detects when the selected global trust level is lower than the current floor.
- Requires a fresh authenticator code before enabling the save action for a downgrade.
- Explains that Core independently validates the current Knox session, superuser authority, and TOTP before the root-owned policy is changed.
- Raising or retaining the trust level does not prompt for MFA.
