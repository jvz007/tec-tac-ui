# System Updates

System Updates manages Framework and UI release discovery and controlled update installation.

## Release discovery

Tec-Tac caches the last known stable release information so the page can show current release state without querying GitHub on every visit. Manual refresh forces a new release lookup.

## Before updating

Review the installed version, discovered release and package source before starting an update. Framework and UI are independent components and may have different release versions.

## Failed updates

Lifecycle jobs retain failure details so an interrupted or failed update can be diagnosed without relying on a transient popup.

## Trust policy changes

Raising the global trust floor is applied immediately by Core. Lowering the trust floor is deliberately console-only: the Tactical web service account cannot weaken the root-owned signing policy. When a lower level is selected, the UI provides the root-console command instead of changing the policy itself.

See **Changing the trust level** for the trust levels, temporary console workflow, automatic switch-back and audit locations.
