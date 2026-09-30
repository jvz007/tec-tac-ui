# Tec-Tac UI 0.12.14

## Global update/module trust policy

- Added a compact **Trust policy** control to System Updates.
- The settings dialog lets an administrator select the minimum accepted tier: `Unsigned`, `Signed Development`, `Signed Production`, or `Secure Signed`.
- The dialog makes clear that the setting applies to both System Updates and Module Management and that stricter component/module rules still take precedence.
- Stable release cards now show whether the discovered release is accepted or blocked by the current global trust floor and disable release staging when the global floor blocks it.
- Module package trust details now show signing assurance and the acceptance-policy decision when present.
- Updated unsigned-module wording so it no longer implies unsigned packages are always permitted.
