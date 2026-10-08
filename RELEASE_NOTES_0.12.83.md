# UI 0.12.83

Released 8 October 2026. Requires Core 1.17.2 or later.

## What changes for you

- **The browser security policy now starts in report-only mode.** Report-only blocks nothing. The browser only writes a `[Report Only]` line to its console when something would have been blocked. Enforcing is opt-in: set `TEC_TAC_CSP_MODE=enforce` in `/opt/tec-tac/etc/tec-tac.conf`, then run `sudo bash scripts/repair-nginx.sh`. Switch it on only after every installed module page has loaded with no `[Report Only]` lines. An unknown mode value now falls back to report-only, with a warning.
- **The dev server is not affected.** It already runs report-only by hand. The new default only changes servers whose `tec-tac.conf` does not set `TEC_TAC_CSP_MODE`. Re-run `repair-nginx.sh` after installing and it keeps the setting.
- **Troubleshooting & Diagnostics shows the blocks it sees.** A new card, Recent browser policy blocks, lists the last 20 different policy hits: the directive, whether it was blocked or only flagged, the address without its path or query, and the page. It has a Copy button. The list lives in memory only and clears on reload. We added it so the cause of a failing page can be read without opening DevTools. The Server WAF "Failed to fetch" on its status page is still being traced: please load that page once, then paste the card's contents (or the console line) to us.
- **The policy builder reads more kinds of `PROD_URL`.** Upper-case schemes and hosts (`HTTPS://API.X.test`) and URLs with a query or fragment used to remove the whole policy. They now work. A default port (`:443` on https, `:80` on http) is dropped, the same way a browser treats it. The UI's own API address no longer builds `//api/...` when `PROD_URL` ends in a slash.
- **System Configuration is a new page** (Administration, `/system/settings`). The module start-up time limit moved there from Modules. It shows for a superuser, or for holders of `core.privileged_operations` or `core.runtime_settings.manage`. Others do not see the entry, and a direct visit shows a "not available" message without loading anything. The backend still decides who can save. A change applies the next time the page loads.
- **System Updates stages the source it shows you.** The page now sends the saved source (release, or the saved branch) with every Download & inspect. The inspection card shows the source type, the branch or tag and the first seven characters of the commit, for example `branch dev · 1a2b3c4`. If the package comes from a different source than the page asked for, Install is disabled and a message says why. A one-off Advanced stage still works. It shows "One-off source: not saved. Saved source is BRANCH dev."

## For module authors

No registry, runtime helper or `api()` behaviour changes. `apiBase()` (internal to `src/api.js`, imported by no module) now trims trailing slashes from `PROD_URL`. Modules that read `window._env_.PROD_URL` themselves are not touched. Nothing under `modules/` uses the System Updates, update-source or runtime-settings routes, and nothing imports `RuntimeSettingsCard`.

## Tests

New: `csp-report-only-default-0.12.83.sh`, `csp-prod-url-0.12.83.sh` (with `csp-match-helper-0.12.83.mjs`), `csp-violations-0.12.83.mjs`, `system-settings-page-0.12.83.mjs`, `update-source-stage-0.12.83.mjs`. `api-contract-routes-0.12.58-1.mjs` now scans every `.js` and `.vue` file under `src/` for `/api/tfd/` routes instead of `api.js` alone. `csp-nginx-0.12.81.sh`, `runtime-settings-control-0.12.81.mjs` and `update-source-0.12.82.mjs` were updated for the changes above.

## What we could not check here

`nginx -t` and a live header check cannot run on the build PC. After installing, run `curl -I https://<server>/tec-tac/index.html`. Expect `Content-Security-Policy-Report-Only` and `X-Content-Type-Options: nosniff`.

## Not in this release

Moving the update-source default onto System Configuration waits on a Core answer. The update-source control stays on System Updates.
