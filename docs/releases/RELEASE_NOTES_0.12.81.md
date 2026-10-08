# UI 0.12.81

Released 8 October 2026. Requires Core 1.17.1 or later (the settings control needs its runtime-settings endpoint). Against an older Core the shell still works, with a 30 second module limit and no settings card.

## What changes for you

- One broken module no longer takes Tec-Tac down with it. A module that crashes while it draws, or hangs while it starts, is contained. The rest of the shell keeps working.
- An action you are not allowed to use is now hidden, not greyed out.
- Administrators can set how long a module may take to start.
- The nginx snippet now sends a Content-Security-Policy header.

## For module authors

Everything here is additive except one item: permission-denied entries are now hidden, not disabled (AD-12).

### 1. Reliable `api()` error shape

Every error from `api()`, `apiRaw`, `apiBlob`, `apiText` and `publicApi()` carries `.status`, `.payload` and `.code`. Core's sign-in and SSO requests use the same shape.

- `.status` is `0` when no response arrived (network failure, abort, or no Tactical API address), `401` when there is no token, and the HTTP status otherwise. The error-key rejection keeps its `2xx` status.
- `.payload` is the parsed body: an object for JSON, a string for text, `null` for a 204, an empty or unparseable body, and for status `0`.
- `.code` is `payload.code` when it is a string, otherwise `null`.
- The original `TypeError` or `AbortError` keeps its name and message. The field stays `payload` (17 modules read it); there is no `body` alias.
- The comment above the error-key check in `api.js` was stale and is corrected. `api()` throws on any 2xx JSON object with a truthy `error` or `detail` key unless `rejectErrorPayload: false` is passed. `apiRaw`, `apiBlob` and `apiText` never do that. A 401 ends the session first.
- Documented in `docs/module-runtime-api.md`.

### 2. Failure containment (rule 2.8)

A new Core error boundary (`src/components/module-error-boundary.js`) wraps every routed page, every module header item and every dashboard widget. A throw in setup, render, a lifecycle hook, a watcher or an event handler is caught.

- A page shows a "could not load" panel with the provider name and a Retry button. The panel clears when the route changes.
- A header item shows a small warning marker. The top bar never breaks.
- A dashboard widget shows an inline message and Retry. The other widgets stay intact.
- Each capture is recorded in `state.moduleRuntimeErrors` (newest last, at most 50). Modules shows the provider as "runtime error" with the message.
- `main.js` sets `app.config.errorHandler` as a last resort. It logs with the `[TEC-TAC-UI]` prefix and records the error.
- Resource views have no Core consumer today, so no generic `ResourceViewSlot` is built (see "Left out").

Difference from the plan: the page boundary resets through a `resetKey` (`route.fullPath`) instead of re-creating the boundary on every route change. A re-keyed boundary would remount a module's page each time its query string changed and lose its state.

### 3. Module `register()` time limit

- `GET /api/tfd/ui/context/` now feeds `module_register_timeout_seconds`. Core normalizes it to a whole number from 5 to 300, otherwise 30. `emptyRuntimeContext()` carries 30.
- `loadUiModules` races `import(entry)` plus `register(context)` against that limit. A module that times out or throws is marked failed: `failed[]` gets `{ id, message }`, and for a timeout also `timedOut: true` with `register() did not finish within N seconds`.
- A failed module's contributions are removed: every registry (now including audit and the code editor), its navigation through the new `runtime.removeNavigation(moduleId)`, and its routes. This also fixes the old gap where a module that threw after `addNavigation` or `addRoute` left them behind.
- JavaScript cannot cancel a hung `register()`, so the module is marked abandoned. Later calls to `addNavigation`, `router.addRoute` or a scoped registry throw, and the cleanup runs again if the promise settles late. The modules after it still load.
- `loadPublicUiModules` has the same limit at a fixed 30 seconds, because it runs before sign-in. A hung public module no longer blocks the login page.
- `loadUiModules` and `loadPublicUiModules` take an optional last argument `{ timeoutMs }`, used only by tests.

### 4. Hidden when denied, everywhere (AD-12)

- Context actions, quick actions and context interactions the user lacks the permission for return `state.visible = false` and are not listed. The reason stays in `state` for diagnostics. This replaces `visible: true, enabled: false`.
- Resource views, header contributions and dashboard widgets already hid denied entries. Tests now cover them as well.
- Quick-action pins whose action is denied are hidden, not deleted. They return when the permission returns. `movePin` moves relative to the visible pins. `pinAction`, `executePin` and `execute()` still throw with the permission reason.
- `addNavigation(item)` accepts an optional `permission` or `permissions`. The left navigation hides an item the user lacks. Superusers always see it, and an item without the field is shown as before.
- Without a backend-supplied context there are no permissions, so permission-gated entries are hidden (the safe default).
- The backend still refuses. Hiding is not authorization.
- Visible change: a module that showed a greyed-out entry now shows nothing.

### 5. Server URL in the runtime context

`context.server_url` is the Tactical API base without a trailing slash, the same value `apiBase()` uses. It is `''` when unset or not `http(s)`. It is read-only and documented. Agent Management can now stop reading `window._env_`; that change is its own work and ends this request.

## Settings control (UI half of UI Q3)

Modules has a new card, "Module start-up time limit". It reads `GET /api/tfd/system/runtime-settings/` and shows the value, range, default, who changed it and when.

- Superusers and holders of `core.privileged_operations` (what Core 1.17.1 enforces) also get a whole-number field (5 to 300) and a Save button. The field is checked in the browser. Core's 400, 403 and 429 messages are shown as returned.
- After saving, the card says the new limit applies the next time the page is loaded.
- Everyone else sees the value read-only, with no form.
- A 404 (older Core) leaves the card out.
- `tec_tac_package.json` now requires `tec-tac-framework >=1.17.1,<2.0.0`.
- CQ10 (an RBAC right for Core or the module) is a later Core release. The UI follows it when Core publishes the codename.

## Content-Security-Policy

`scripts/repair-nginx.sh` now writes `Content-Security-Policy` into `location = /tec-tac/index.html` and `location ^~ /tec-tac/`. `scripts/tec-tac-csp.sh` builds it.

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: <API origin>; font-src 'self' data:; worker-src 'self' blob:;
connect-src 'self' <API origin> <API origin as wss>; frame-src 'self' blob: https:;
object-src 'none'; base-uri 'self'; frame-ancestors 'self'
```

- The Tactical API sits on its own origin (the HAR files show `api.tcrm.techxflow.net.za`), so a literal `connect-src 'self'` would break every call. `repair-nginx.sh` reads `PROD_URL` from `${TACTICAL_FRONTEND_ROOT:-/var/www/rmm/dist}/env-config.js`. If it cannot read an `http(s)` value, it logs a warning and writes no policy.
- `img-src` also allows the API origin. The plan listed only `'self' data: blob:`; images the API serves would otherwise break.
- `form-action` is left out on purpose. The SSO handshake posts a form to the API origin and then redirects to the identity provider, which Chrome would block.
- `TEC_TAC_CSP_MODE` is `enforce` (default), `report-only` or `off`. `TEC_TAC_CSP_CONNECT_EXTRA`, `TEC_TAC_CSP_FRAME_EXTRA` and `TEC_TAC_CSP_IMG_EXTRA` widen the policy. Set them in `tec-tac.conf`, then run `sudo bash scripts/repair-nginx.sh`. Extra values are checked: anything that is not a plain host or scheme is dropped.
- The existing `nginx -t` check and the restore-on-failure path are unchanged.

**What the policy does not do.** A CSP stops injected scripts and scripts from other sites. Module scripts are same-origin, so they can still read `localStorage`. It does not meet the goal "module scripts cannot read the token storage" (CQ9). Johan chose to stay with option (a).

**Report Manager previews.** Previews built with `srcdoc` inherit this policy, so external images inside them are blocked. Use `TEC_TAC_CSP_IMG_EXTRA` if a server needs them.

## AD-12 row

| Decision | Status in 0.12.81 |
|---|---|
| AD-12 hidden when denied | Done for context actions, quick actions, context interactions and module navigation. Resource views, header contributions and dashboard widgets were already hidden and are now tested. |

## Left out

- Browser service registry between modules (needs its own design pass).
- Tactical WebSocket helper (needs Core's WebSocket ticket first).
- Chromeless route layout flag.
- Tactical permission flags and role scope in the runtime context (Core computes them first).
- Remembered update source per component (the Core release is not signed yet).
- UI use of the CQ10 permission (the codename does not exist yet).
- Fail-closed module loading when the context does not come from the backend. This is a separate security release (planned 0.12.82).
- A generic `ResourceViewSlot` with an error boundary. No Core page consumes `resourceViews` today.
- Contract catalog rows for the new runtime members. Core owns the contract export; the request is in `reviews/requests/core.md`.

## What could not be run here

- `nginx -t` and a live page load with the policy. This PC has no nginx and no root. The policy is covered by shell tests on the generated header and on the script text only.
- A real browser mount. The error boundary tests run on Vue's custom renderer with an in-memory node tree, because `node_modules` has no DOM.
- `python3` in the shell tests needs a Linux runtime. On this Windows machine the `python3` alias does not start, so the new CSP test uses `awk` and `grep` instead.

## Tests

New: `tests/api-error-shape-0.12.81.mjs`, `tests/module-failure-containment-0.12.81.mjs`, `tests/module-register-timeout-0.12.81.mjs`, `tests/hidden-when-denied-0.12.81.mjs`, `tests/csp-nginx-0.12.81.sh`, `tests/runtime-settings-control-0.12.81.mjs`. Earlier release notes moved to `docs/releases/`.

Unsigned source delivery.
