# UI 0.12.122

Date: 21 October 2026. Requires Core 1.17.67 or later (unchanged).

## What changes for you

Nothing you can see. This release moves our build tool, vite, from 6.4.3 to 6.4.5 to clear the last HIGH-severity npm advisory. There is no feature work and no change to any module contract, helper, registry or `api()` behaviour.

## Packages

| Package | Before | After | Kind |
|---|---|---|---|
| vite | 6.4.3 | 6.4.5 | Build-time and dev-server tool. Not part of the browser bundle. |

The release ships vite 6.4.5. `@vitejs/plugin-vue` stays at 5.2.4, which accepts vite 6. vue and every @vue/* package stay at 3.5.42.

## Advisories

vite 6.4.3 was flagged for three launch-editor advisories: GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw and GHSA-587h-7wmj-h5pm. vite and launch-editor are build-time and dev-server dependencies. Neither is part of the browser bundle. Whether `npm audit` is clean after the bump is stated under Checks.

## Rollback

Roll back to 0.12.121 (vite 6.4.3) if the build misbehaves. Johan chose this bump knowing that.

## Checks

With `NODE_OPTIONS=--use-system-ca`, for each command only: `npm install vite@6.4.5 --save-exact`, `npm ci`, `npm audit`, `npm test`, `npm run build`. New test: `tests/dependency-audit-0.12.122.mjs`. Certificate checking was not turned off.

## What could not run

The packaged install on a dev server was not run here. The pack and sign steps belong to the release manager.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` fails because Report Manager 0.7.4 defines `.tt-win`. That is requested from the core-modules area ("reportmanager: use TagEditor inputId and describedBy; stop defining .tt-win") and is not fixed in this release. It failed before this release too.

## Left out, and why

No feature work. Held Core items (maintenance Download and the regenerated contract export) are unchanged.

## Dev-server checklist

1. **Sign in and open the dashboard.** PASS: the page loads and the menu shows your modules. FAIL: a blank page or a console error. Send back: a screenshot and the browser console text.
2. **Open a module screen (for example Endpoints) and a Core page (Users).** PASS: both draw and respond to clicks. FAIL: a module reports it failed to load. Send back: the module name and the message.
3. **Open Modules, then Scheduler.** PASS: both lists load. FAIL: an error banner. Send back: the banner text.

All 196 test entries ran on this PC.
