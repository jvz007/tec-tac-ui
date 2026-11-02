# System Updates

System Updates manages Framework and UI release discovery and controlled update installation.

## Release discovery

Tec-Tac saves what it last learned from GitHub, so opening the page, switching tabs and watching an update job never ask GitHub again. Core only sends a request when a saved answer is old. **Check for updates** asks GitHub about the source the card uses: the branch for a branch source, the stable release otherwise. **Refresh stable release** on a branch card checks the stable release on its own. A button is off while its check runs, so pressing it again sends nothing more. If you press it again within a few seconds, Core shows the answer it just got and the page says so.

**Last checked** reads "Checked 8 seconds ago" or similar. For a branch, Core does not report the time of its saved check, so the page shows when it received a fresh check, or says the answer is Core's saved check (less than 5 minutes old).

The **GitHub API** line shows how many GitHub requests are left, when the count resets, and whether Core uses a GitHub token (Authenticated) or not (Unauthenticated, 60 requests an hour). The token itself is never shown. When the limit is used up, the card keeps the last saved answer marked **STALE** and says when the limit resets. The page does not try again before then.

**Download & inspect** sends the exact commit the card shows. If the branch moved or the release changed since your check, Core downloads nothing and the page asks you to refresh the check and look again. Tec-Tac never installs a different commit without showing it to you first. A one-off Advanced branch stage is not pinned, because Core has no saved check for that branch; its inspection card shows the commit before you install.

## Remembered update source

Each component remembers where its updates come from: the stable release, or a branch such as `dev`. The page shows the saved source when it loads. Only a superuser can change it and press Save. Everyone else sees where updates come from but no form. People with the privileged operations permission can still check, stage and install. Check for updates and Download & inspect then use the saved source, so a change you have not saved blocks both buttons. The Discovered version row follows the saved source. For a branch it shows the branch name, the head commit and the head date, against the installed commit, and no release is shown. DIFFERS means the commits differ. It does not mean the branch is newer. UNKNOWN means the installed commit is not recorded: the next install from a branch records it. Core 1.17.3 can then compare by VERSION, and the page says so. A VERSION match does not prove the commits are equal. Advanced source still stages a different branch once, without saving it. The page stages the source it showed you, and the inspection card shows the branch or release and the commit the package came from. If the package comes from another source, Install is blocked: discard it and stage again. A one-off Advanced stage shows a warning that the source is not saved. With Core 1.17.4 or later, a branch card also shows the latest stable release in a secondary Stable release row, with its date, whether it is signed and whether your trust policy accepts it. Use stable release (superusers only) switches the saved source back to Release. It does not download or install anything.

## Before updating

Review the installed version, discovered release and package source before starting an update. Framework and UI are independent components and may have different release versions.

## Failed updates

Lifecycle jobs retain failure details so an interrupted or failed update can be diagnosed without relying on a transient popup.

## Trust policy changes

Raising the global trust floor is applied immediately by Core. Lowering the trust floor is deliberately console-only: the Tactical web service account cannot weaken the root-owned signing policy. When a lower level is selected, the UI provides the root-console command instead of changing the policy itself.

See **Changing the trust level** for the trust levels, temporary console workflow, automatic switch-back and audit locations.
