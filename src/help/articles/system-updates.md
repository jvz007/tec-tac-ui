# System Updates

System Updates manages Framework and UI release discovery and controlled update installation.

## Release discovery

Tec-Tac caches the last known stable release information so the page can show current release state without querying GitHub on every visit. Manual refresh forces a new release lookup.

## Before updating

Review the installed version, discovered release and package source before starting an update. Framework and UI are independent components and may have different release versions.

## Failed updates

Lifecycle jobs retain failure details so an interrupted or failed update can be diagnosed without relying on a transient popup.

## Trust policy changes

Raising the global trust floor is applied immediately by Core. Lowering the trust floor is a higher-risk operation and requires a fresh authenticator code from an effective superuser. Core independently verifies the active Knox session and TOTP before updating the root-owned policy. A direct root-console policy change remains available as a break-glass recovery path.
