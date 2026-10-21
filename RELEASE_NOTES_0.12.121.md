# UI 0.12.121

Date: 21 October 2026. Requires Core 1.17.67 or later (unchanged).

## What changes for you

Nothing you can see. This release fixes three HIGH-severity advisories that an external static audit found in our npm dependencies. There is no feature work and no change to any module contract, helper or registry.

## Packages

| Package | Before | After | Kind |
|---|---|---|---|
| vue (and every @vue/* package it pins) | 3.5.22 | 3.5.42 | Runtime. Bundled into the browser build and handed to modules as `context.Vue`. |
| @vue/server-renderer | 3.5.22 | 3.5.42 | A required dependency of vue. Not imported by the app and not in the browser bundle. |
| nanoid | 3.3.16 | 3.3.20 | Build-time (postcss, used by vite and @vue/compiler-sfc). Not in the browser bundle. |
| source-map-js | 1.2.1 | 1.2.2 | Build-time, same path as nanoid. |

The three advisories are GHSA-g2v6-rqmx-r4w6 (@vue/server-renderer), CVE-2026-67213 (nanoid) and CVE-2026-93749 (source-map-js). `npm audit` no longer lists any of them. postcss (8.5.25) and vite (6.4.3) did not move. The lock lists nanoid and source-map-js under vue's tree, so audit counts them as production, but they are not in the built browser files.

## One HIGH advisory is still open

`npm audit` still reports vite 6.4.3 (three launch-editor advisories: GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm). Vite is a build and dev-server tool, not part of the browser bundle. The fix is vite 6.4.5, which is outside our declared range, so it was not part of this release. It is left for a later one.

## Why Q93 and Q94 were wrong

Our network firewall (Fortinet) inspects TLS. Node does not read the Windows certificate store by default, so npm could not verify the registry and reported the versions as missing. Running npm with `NODE_OPTIONS=--use-system-ca`, for each command only, fixed it. Certificate checking was never turned off, no `.npmrc` was added and no global npm setting was changed.

## Checks

With `NODE_OPTIONS=--use-system-ca`: `npm install vue@3.5.42 --save-exact`, `npm update nanoid source-map-js`, `npm ci` from a clean `node_modules`, `npm audit`, `npm test` and `npm run build`. New test: `tests/dependency-audit-0.12.121.mjs`.

## What could not run

The packaged install on a dev server was not run here. The pack and sign steps belong to the release manager.

## Left out, and why

No feature work. The vite advisory above needs a version outside our declared range, so it waits for a later release. Held items for Core (maintenance Download and the regenerated contract export) are unchanged.

## Dev-server checklist

1. **Sign in and open the dashboard.** PASS: the page loads and the menu shows your modules. FAIL: a blank page or a console error about Vue. Send back: a screenshot and the browser console text.
2. **Open a module screen (for example Endpoints) and a Core page (Users).** PASS: both draw and respond to clicks. FAIL: a module reports it failed to load. Send back: the module name and the message.
3. **Open Modules, then Scheduler.** PASS: both lists load. FAIL: an error banner. Send back: the banner text.

All 195 test entries ran on this PC. 194 passed. One failed: `tests/theme-tokens-0.12.114.mjs`, because Report Manager 0.7.4 defines `.tt-win`. That is a module problem already requested from the core-modules area, and it failed before this release.
