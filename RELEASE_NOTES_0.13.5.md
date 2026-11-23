# UI 0.13.5

Date: 23 November 2026. Requires Core 1.18.45 or later (unchanged).

## What changes for you

On the Roles screen, each extension permission now shows its own action word. A `.view` permission reads "view", a `.read` permission reads "read", and a `.list` permission reads "list". Before, all three read "read", so two rows could look identical.

- Example: Advanced Alerts now shows `view — advancedalerts` and `read — advancedalerts` as separate rows, next to manage and notify.
- Searching for "view" now finds `.view` permissions by their label as well as by their code.
- Multi-word permissions such as `apps view` are unchanged.

Permission codes, saved roles and grants do not change. This is a label only. About 30 modules declare single-word `.view`, `.read` or `.list` permissions. Their rows now show "view" or "list" where they showed "read". Nothing breaks.

## For module developers

No registry, runtime helper or `api()` change. The only edit is in `src/components/access/RolesPanel.vue` (`extensionPermissionLabel`).

## Assumptions

- `list` also shows its own word, for the same reason as `view`.

## Checks

`npm test`: 206 test entries ran on this PC. New: `tests/roles-permission-label-0.13.5.mjs`. The release test is now `tests/release-0.13.5.mjs`. The 0.13.4 notes moved to `docs/releases/`. The request from advancedalerts 0.1.5 is removed from `reviews/requests/ui.md` with this release.

## Dev-server checklist

1. **Roles labels.** Open Settings, Users and Roles. Pick a non-superuser role. Expand Advanced Alerts. PASS: separate rows `view — advancedalerts` and `read — advancedalerts`, plus manage and notify rows. FAIL: two rows both showing "read". Send back: a screenshot of the Advanced Alerts group.
2. **Search.** Type "view" in the search box. PASS: the view row shows. FAIL: it does not. Send back: a screenshot.
