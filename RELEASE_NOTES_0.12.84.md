# UI 0.12.84

Released 8 October 2026. Works with Core 1.17.2 and later. Core 1.17.3 or later gives the best result.

## What changes for you

- **System Updates shows the version of the source you saved.** Each component card has one headline row, Discovered version. When the saved source is a branch, it shows the branch name, the first seven characters of the head commit and the head date, for example `dev 9c578f6`. A pill says SAME, DIFFERS or UNKNOWN against the installed commit. DIFFERS means the commits differ. It does not mean the branch is newer.
- **A branch source no longer shows any release.** The Stable release, Release trust and Acceptance rows and the release error banner only appear when the saved source is Release. The page also stops filling the card from the cached release lookup when a branch is saved. Before the first check, a branch card says "Not checked yet. Use Check for updates."
- **A release source with no release found stays plain.** It shows "Not checked yet" or Core's release error. No empty Stable release, trust or acceptance rows.
- **The page says when the installed commit is not recorded.** "Installed commit not recorded. The next install from a branch records it." With Core 1.17.3, a comparison made by VERSION says so: "Compared by VERSION (branch head X, installed Y). A VERSION match does not prove the commits are equal." If neither commit nor VERSION could be compared, the card says that too.
- **Last checked works for a branch.** Core returns no check time for a branch, so the page shows when it received the check, marked "this session". The STALE pill is hidden for a branch.

## For module authors

No registry, runtime helper or `api()` behaviour changes. Nothing under `modules/` uses the System Updates routes.

## Tests

New: `discovered-version-0.12.84.mjs`.

## What we could not check here

The card has not been run against a live Core. Please check the dev server after installing: with both sources saved as branch `dev`, each card should headline `dev` and the head commit, show no release tag, and compare by commit or by VERSION.
