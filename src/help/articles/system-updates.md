# System Updates

System Updates manages Framework and UI release discovery and controlled update installation.

## Release discovery

Tec-Tac caches the last known stable release information so the page can show current release state without querying GitHub on every visit. Check for updates forces a new lookup.

## Remembered update source

Each component remembers where its updates come from: the stable release, or a branch such as `dev`. The page shows the saved source when it loads. A superuser, or an administrator with the privileged operations or runtime settings permission, can change it and press Save. Check for updates and Download & inspect then use the saved source, so a change you have not saved blocks both buttons. For a branch, the page shows the branch head against the installed commit. DIFFERS means the commits differ. It does not mean the branch is newer. UNKNOWN means the component has not been installed yet with Core 1.17.2 or later: stage and install once to compare. Advanced source still stages a different branch once, without saving it. The page stages the source it showed you, and the inspection card shows the branch or release and the commit the package came from. If the package comes from another source, Install is blocked: discard it and stage again. A one-off Advanced stage shows a warning that the source is not saved.

## Before updating

Review the installed version, discovered release and package source before starting an update. Framework and UI are independent components and may have different release versions.

## Failed updates

Lifecycle jobs retain failure details so an interrupted or failed update can be diagnosed without relying on a transient popup.

## Trust policy changes

Raising the global trust floor is applied immediately by Core. Lowering the trust floor is deliberately console-only: the Tactical web service account cannot weaken the root-owned signing policy. When a lower level is selected, the UI provides the root-console command instead of changing the policy itself.

See **Changing the trust level** for the trust levels, temporary console workflow, automatic switch-back and audit locations.
