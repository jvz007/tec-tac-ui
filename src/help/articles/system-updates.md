# System Updates

System Updates manages Framework and UI release discovery and controlled update installation.

## Release discovery

Tec-Tac caches the last known stable release information so the page can show current release state without querying GitHub on every visit. Check for updates forces a new lookup.

## Remembered update source

Each component remembers where its updates come from: the stable release, or a branch such as `dev`. The page shows the saved source when it loads. Only a superuser can change it and press Save. Everyone else sees where updates come from but no form. People with the privileged operations permission can still check, stage and install. Check for updates and Download & inspect then use the saved source, so a change you have not saved blocks both buttons. The Discovered version row follows the saved source. For a branch it shows the branch name, the head commit and the head date, against the installed commit, and no release is shown. DIFFERS means the commits differ. It does not mean the branch is newer. UNKNOWN means the installed commit is not recorded: the next install from a branch records it. Core 1.17.3 can then compare by VERSION, and the page says so. A VERSION match does not prove the commits are equal. For a branch, Last checked shows when this page received the check. Advanced source still stages a different branch once, without saving it. The page stages the source it showed you, and the inspection card shows the branch or release and the commit the package came from. If the package comes from another source, Install is blocked: discard it and stage again. A one-off Advanced stage shows a warning that the source is not saved. With Core 1.17.4 or later, a branch card also shows the latest stable release in a secondary Stable release row, with its date, whether it is signed and whether your trust policy accepts it. Use stable release (superusers only) switches the saved source back to Release. It does not download or install anything.

## Before updating

Review the installed version, discovered release and package source before starting an update. Framework and UI are independent components and may have different release versions.

## Failed updates

Lifecycle jobs retain failure details so an interrupted or failed update can be diagnosed without relying on a transient popup.

## Trust policy changes

Raising the global trust floor is applied immediately by Core. Lowering the trust floor is deliberately console-only: the Tactical web service account cannot weaken the root-owned signing policy. When a lower level is selected, the UI provides the root-console command instead of changing the policy itself.

See **Changing the trust level** for the trust levels, temporary console workflow, automatic switch-back and audit locations.
