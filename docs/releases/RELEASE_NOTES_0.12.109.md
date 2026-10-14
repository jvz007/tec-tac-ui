# UI 0.12.109

Date: 14 October 2026. Requires Core 1.17.39 or later (raised from 1.17.38, the Core release this UI was built and tested against).

## What changes for you

- **You see which repository entries were skipped.** A module repository may list an entry that Tec-Tac cannot use. Core now skips that entry and keeps the rest. On the Repositories tab, the Sync column shows "N skipped" under the status, including "0 skipped" when nothing was skipped. If Core lists fewer entries than it counted, the column says so, for example "150 skipped, first 100 listed".
- **The repository editor lists each skipped entry.** Select a repository and the editor shows a Skipped entries block. Each entry shows its position in the index, its module id, its version and the reason. A missing id or version shows as a dash. If you cannot manage modules, Core sends a general reason in place of the detailed one, and that is what you see.
- **The online catalog shows release details.** Each row can show a channel, a lifecycle stage and a "recommended" label, as plain labels. They are for information only. They do not change the Download button, the search or the filters, and they do not decide what gets installed.
- **Older Core builds still work.** A Core older than 1.17.39 sends none of these details, so the screens show nothing extra.
- **Module settings give the right result to each caller.** When a module sets and then removes one setting within 400 ms, both writes still reach Core as one request. Each call now gets a result of its own kind (see below).

## For module developers

- `context.modulePreferences` merges a `set()` and a `remove()` on one name within 400 ms into one request. Each call gets a resolved value of its own type:
  - When the last operation is a `set()`, every `set()` resolves with the value Core stored, and every `remove()` resolves `false`.
  - When the last operation is a `remove()`, every `remove()` resolves `true` or `false` as Core answered, and every `set()` resolves `undefined`.
- Every merged call still gets the same rejection, for example the same 403 or 503 error.
- Before 0.12.109, every merged call got the same resolved value. A module that tested the old value for a mixed set and remove must change that check. No module in `modules/` calls the helper today.
- `docs/module-preferences.md` has the full rule.

## Tests changed

- The 0.12.108 test `module-preferences-debounce-0.12.108.mjs` expected the set in a set-then-remove pair to resolve `true`. It now expects `undefined`, which is the new rule. This is the only older assertion that changed in behaviour.
- Twenty older tests now check the Core requirement `>=1.17.39,<2.0.0`. This is a one-line change in each.

## Housekeeping

- The answered questions Q53, Q54 and Q55 are removed from the question list. Their answers are recorded as applied in UI 0.12.107 and 0.12.108.

## Known limits

- On the Light and Dark themes, some Tactical colours are harder to read against the card. Info and Warning on the light card, and Negative on the dark card, have low contrast. Each figure also has a text label beside it. If a figure is hard to read for you, use High contrast. This is unchanged from 0.12.108.
- The loading bar shows while a request is in flight, not while a long response body is read.
