# UI 0.12.85

Released 8 October 2026. Needs Core 1.17.4 or later.

## What changes for you

- **A branch card now shows the latest stable release too.** When the saved update source is a branch, the branch stays the headline: Discovered version, Installed and Comparison are exactly as in 0.12.84. Beneath them, a new Stable release row shows the next release Core knows about: its tag, its published date, whether it is signed, whether your trust policy accepts it, and whether installing it is an install, upgrade or downgrade.
- **It shows on first load.** Core 1.17.4 sends the cached release with the page status, so you see the row before you press Check for updates. A Check for updates replaces it with a fresh answer.
- **Cached or failed lookups are marked.** A muted STALE pill means Core served a cached copy. If the release lookup fails, the reason appears as a muted line inside that row. It never appears in the branch error area, and a branch problem never hides the release.
- **One click back to Release.** If you can change the update source, the row has a Use stable release button. It saves Release as the source and checks again. It does not download or install anything. Core still checks your permission and tells you if it refuses.
- **Nothing known yet** reads "Not checked yet".

## Requirements

Core 1.17.4 or later. The package now requires `tec-tac-framework >=1.17.4,<2.0.0`. A Core older than that sends no stable release, so the row would simply be missing.

## For module authors

No registry, runtime helper or `api()` behaviour changes. No module is affected: nothing under `modules/` uses the System Updates routes.

## Under the hood

- New helper `stableRelease()` in `src/update-source.js`.
- The signed/unsigned badge and its details popover moved into one shared block, `src/components/ReleaseTrustBadge.vue`. The release rows and the new row both use it. The popover test now reads the new file.
- `saveSource()` and the new switch share one save helper.

## Tests

New: `stable-release-0.12.85.mjs`. Two earlier tests changed by one line each: `system-update-trust-popover-focus.sh` (the popover markup moved) and `update-source-0.12.82.mjs` (the Core requirement now reads any 1.17.x minimum).

## What we could not check here

The row has not been run against a live Core 1.17.4. Please check the dev server after installing: with a branch saved, each card should show `dev <commit>` as the headline and a Stable release row beneath it.
