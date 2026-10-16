# UI 0.12.115

Date: 16 October 2026. Requires Core 1.17.49 or later (raised from 1.17.48, the newest signed Core on dev). This release fixes the sort arrows on tables and closes three small installer findings. **Nothing in this release was tested on the dev server, and no screenshot of the sort arrows was taken.** The checks ran in node, in shell tests with stubbed tools, and in the build.

## What changes for you

- **Table sort arrows show as arrows again.** A sorted column header in a `DataTable` should show an up or down triangle. The CSS held a stray control character followed by the letters "B2" or "BC", so the header would not have shown a clean arrow. Both rules now use the CSS escapes for the triangles. Nothing else about the table changes.
- **An integrated Tactical host with no findable nginx block is refused, not passed.** If Tactical's frontend folder exists but the installer finds no Tactical nginx server block, it now stops before it changes anything. System Updates shows "Update refused, nothing was changed", and the message names the two settings to fix: `TACTICAL_FRONTEND_NGINX_CONF` and `TEC_TAC_NGINX_SITES_ENABLED`. A host with no Tactical frontend folder is still treated as standalone, as before.
- **`repair-nginx.sh` follows `TEC_TAC_NGINX_SITES_ENABLED`.** It used a fixed `/etc/nginx/sites-enabled` while the installer honoured the setting. Both now use the one setting.
- **The installer header comment is accurate.** It lists all four sources of the Tactical API address, in the order the README gives: the caller's `TEC_TAC_API_URL`, `TEC_TAC_API_URL` in `tec-tac.conf`, the `PROD_URL` of the `env-config.js` the installer wrote last time, and the `PROD_URL` in Tactical's own `env-config.js`. The last one is read only and never copied. This is a comment change. Behaviour is the same.

No module is affected. No registry, runtime helper, `api()` behaviour or contract changes.

## Fixed after held reviews

- **Review of 0.12.114 (Medium): sort arrows.** Fixed as above. `tests/sort-arrows-0.12.115.mjs` reads the bytes and also scans every `.css`, `.js` and `.vue` file under `src/` for control characters, so this cannot return in shipped source. `tests/theme-tokens-0.12.114.mjs` asserts the two rules too.
- **Held from the 0.12.113 review (Low): stale archive copy of the 0.12.113 notes.** It was already fixed in 0.12.114 (the archive copy is the corrected root copy). This release locks it with a test in `tests/core-requirement-0.12.115.mjs`. The backlog line can be closed.
- **Held from the 0.12.113 review (Low): install.sh header comment.** Fixed as above.
- **Held from the 0.12.113 review (Low): an integrated host treated as standalone.** Fixed as above, with one deliberate difference from the reviewer's wording. The reviewer asked to keep the old loud failure from `repair-nginx.sh`. The installer now fails the same way, but before the live swap, because the 0.12.113-1 review objected to a failure after it. `repair-nginx.sh` still fails by itself if it is reached with no block.
- `tests/installer-env-config-0.12.113.sh` now gives its default run a stub `frontend.conf`, because its Tactical-hosted cases create a frontend folder and would otherwise be refused by the new rule.

The 0.12.114 notes moved to `docs/releases/`. Earlier notes are kept.

## Check it worked

```bash
cd workspace/ui && npm test && npm run build
```

Both should finish without an error. On a dev server, sort a table by a column and check the header shows the triangle. That check was not run for this release.

## Left out, and why

- **UI 0.13.0 and Core 1.18.0.** Johan wants them after the theme system (Dark, Light and High contrast) is tested on the dev server. Nothing is bumped.
- **Two held test regexes** in `tests/module-dialogs-0.12.112.mjs` and `tests/shared-select-server-search-0.12.112.mjs` hold raw backspace bytes where `\b` was meant, so their scans never match. Fixing them would probably make them fail, so the intent needs a decision first. The new `src/` scan does not cover `tests/`.
- **The 0.12.113-1 held Medium and Low.** The early refusal above answers the Medium. The README already describes the four sources correctly.
- **Scheduler event jobs panel** (request from Core 1.17.45). A separate feature.
- **`correlationId` on `context.tacticalOperation`** (request from checks 0.16.1). It needs a Core change on the browser route first.
- **The wording "not yet in the export"** in the module docs. The newest contract export still lists none of those rows, so the wording stays true.
- **Showing a module without a category as refused.** Johan has not named that release.
