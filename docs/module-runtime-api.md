# Authenticated module runtime API

Tec-Tac authenticated UI modules receive Core-owned request helpers in `register(context)`. Modules must use these helpers instead of reading `localStorage.access_token`, constructing Tactical `Authorization` headers, or duplicating session-expiry handling.

The `resourceViews` registry also takes grid columns at `endpoint.grid-columns` (UI 0.12.93); see `module-resource-views.md`. This page also covers [the module router](#module-router), [`hasPermission(code)`](#haspermissioncode), [navigation](#navigation-permissions) and [`codeEditor.languages`](#codeeditorlanguages). Modules can also publish and call browser operations through `services`; see `module-services.md` (UI 0.12.101). A module can open a Tactical terminal through `tacticalWebSocket`; see [Tactical terminal socket](#tactical-terminal-socket-tacticalwebsocket) and `module-tactical-websocket.md` (UI 0.12.102).


## Authenticated runtime context

`register(context)` receives the current authenticated Core context directly as `context.context`. The same object remains available through `context.state.context` for compatibility. Treat both as read-only runtime state.

`context.context.user.id` is the signed-in person's Tactical user id (Core sends Tactical's own user primary key, UI 0.12.101). Use it as an owner or author id only when it is a whole number of at least 1; if it is missing, ask the person to sign in again rather than guess one.

The context includes the current user's Tactical UI preferences under:

```js
context.context.tactical_ui = {
  agent_dblclick_action,
  url_action_id,
  can_run_url_actions,
}
```

Modules should consume these values from the runtime context instead of calling Tactical account endpoints directly. Core/UI refresh the values from `/api/tfd/ui/context/`.

Core also publishes stable localization fields:

```js
context.context.locale          // Core/Django effective locale, e.g. "en-us"
context.context.timeZone        // Tactical authoritative default time zone, e.g. "Africa/Johannesburg"
context.context.dateTimeFormat  // Tactical configured date/time format string
```

Use `timeZone` for schedule defaults and module date/time display. Modules may fall back to `Intl.DateTimeFormat().resolvedOptions().timeZone` only when talking to an older Core that does not publish the field. Do not infer undocumented account or preference keys.

Core also publishes whether Tactical's standard web UI is actually installed and routable:

```js
context.context.tactical_web_ui = {
  installed, // true only when the Tactical UI files and nginx frontend are present
  url,       // currently "/" when installed, otherwise null
}
```

Use this capability instead of assuming that a Tactical UI exists on every Tec-Tac server.

Core also publishes the Tactical role's client and site scope as counts (UI 0.12.93, Core 1.17.17). See [`tacticalScope()`](#tacticalscope):

```js
context.context.tactical_scope = {
  mode,               // "unrestricted", "clients", "sites", "mixed" or "none"
  unrestricted,       // true only when mode is "unrestricted"
  whole_client_count,
  site_count,
}
```

## Helpers

### `api(path, options)`

Existing parsed-response helper. It keeps the current Tec-Tac JSON/text behavior and remains backward compatible.

### `apiRaw(path, options)`

Authenticated raw request helper for downloads, uploads and other non-JSON operations.

- Uses the same Tactical API base URL as `api()`.
- Adds the current Tactical `Authorization` header in Core.
- Uses `credentials: 'include'`.
- Uses `cache: 'no-store'` unless overridden.
- Defaults `Accept` to `*/*` but preserves a caller-supplied value.
- Does not force `Content-Type`; callers may use `FormData`, Blob/file bodies or an explicit media type.
- Invalidates the Tactical session on HTTP 401 exactly like `api()`.
- Throws the normal Tec-Tac request error for other non-2xx responses.
- Returns the native `Response` object on success without consuming its body.

```js
const response = await apiRaw('/api/tfd/reporting/export/pdf/', {
  method: 'POST',
  headers: { Accept: 'application/pdf' },
  body: JSON.stringify({ report_id: 42 }),
})
const pdf = await response.blob()
```

### `apiBlob(path, options)`

Convenience wrapper over `apiRaw()` that returns `response.blob()`.

```js
const pdf = await apiBlob('/api/tfd/reporting/export/pdf/', {
  headers: { Accept: 'application/pdf' },
})
```

### `apiText(path, options)`

Convenience wrapper over `apiRaw()` that returns `response.text()`.

```js
const html = await apiText('/api/tfd/reporting/export/html/', {
  headers: { Accept: 'text/html' },
})
```

## Uploads

Use `FormData` for multipart uploads. Do not set `Content-Type` manually because the browser must generate the multipart boundary.

```js
const form = new FormData()
form.append('file', file)
await apiRaw('/api/tfd/example/import/', { method: 'POST', body: form })
```

## Backend authentication contract

Tec-Tac extension DRF endpoints should normally use Tactical/Tec-Tac's configured DRF authentication stack and declare authorization through permissions:

```python
from rest_framework.permissions import IsAuthenticated

class ReportExportView(APIView):
    permission_classes = [IsAuthenticated]
```

Add the module's RBAC permission in the normal module authorization layer where appropriate.

Extension endpoints should **not** explicitly override `authentication_classes` with a Tactical authentication implementation unless there is a specific documented integration reason. Core/Tactical owns authentication configuration; modules own their endpoint authorization and business permissions.

## Boundary rule

Modules must not access `access_token`, browser local storage, or Tec-Tac authentication internals directly. If a transport capability is missing, extend the Core runtime contract rather than reproducing authentication in an extension.

## Shared code editor

Authenticated modules also receive a Core-owned `codeEditor` capability. Monaco is an internal implementation detail; extensions must not import Monaco, Tactical frontend editor assets, or CDN editor runtimes directly.

```js
const editor = codeEditor.create(element, {
  language: 'html',
  value: initialValue,
})
```

The contract supports editor commands/events, Core-owned multi-model editing, completion and hover providers, automatic Tec-Tac theme integration, and module-scoped disposal. See [`docs/module-code-editor.md`](module-code-editor.md) for the complete contract.

## Dashboard widgets

Authenticated modules also receive the Core-owned `dashboardWidgets` capability. Core owns dashboard persistence, private/shared visibility and layout; modules contribute widget components through a stable registry rather than implementing their own dashboard stores.

See `docs/module-dashboard-widgets.md` for registration, permission, sizing and lifecycle rules.
## Shared code editor diagnostics

Authenticated modules receive the Core-owned `codeEditor` capability. In addition to editors, models, completion and hover providers, modules may register parser/linter results through `codeEditor.registerDiagnosticsProvider(language, provider)`. Modules must return plain diagnostic objects and must not import Monaco or manipulate Monaco markers directly. See `docs/module-code-editor.md`.


## Errors thrown by the request helpers

`api()` (`apiFetch`), `apiRaw`, `apiBlob`, `apiText` and `publicApi()` throw one documented shape. Core's own sign-in and SSO requests use it too.

| Field | Meaning |
|---|---|
| `error.status` | `0` when no HTTP response arrived (the network failed, the request was aborted, or the Tactical API address is missing). `401` when there is no browser token. Otherwise the HTTP status. For the error-key rejection below it is the `2xx` status. |
| `error.payload` | The parsed response body. An object for JSON, a string for text. `null` for a `204`, an empty body, an unparseable body, and whenever `status` is `0`. |
| `error.code` | `payload.code` when it is a string, otherwise `null`. |
| `error.message` | Core's message, built from the payload (`detail`, `error` or `message`) or a fallback. |

Core decorates the original error object. A network failure is still the `TypeError` and an abort is still the `AbortError`, with the same name and message. The field is `payload`; there is no `body` alias.

```js
try {
  await api('/api/tfd/example/')
} catch (error) {
  if (error.status === 0) showOffline()          // nothing reached the server
  else if (error.code === 'example_locked') ...  // a machine-readable reason
  else showMessage(error.message)
}
```

**The error-key rule.** Tactical sometimes answers `200` with a body such as `{ "error": "..." }`. `api()` throws on any `2xx` JSON object with a truthy `error` or `detail` key, with `status` set to that `2xx` status and the body in `payload`. Pass `rejectErrorPayload: false` to get the body back instead. `apiRaw`, `apiBlob` and `apiText` never look at the body this way. A `401` ends the session first, then throws.

## Server URL

`context.context.server_url` is the Tactical API base without a trailing slash, the same value Core itself uses for requests. It is `''` when the address is not set or is not an `http(s)` URL. It is read-only. Use it instead of reading `window._env_`.

## Module start-up time limit

`context.context.module_register_timeout_seconds` is how long Core waits for a module to start. The value comes from Core (whole seconds from 5 to 300, default 30; an administrator changes it in Modules). The limit covers loading the module's entry file and running `register(context)` together. It does not cover work a module starts after `register()` returns.

A module that takes longer, or throws, is marked failed and Core carries on with the next module:

- `moduleLoad.failed` gets `{ id, message }`. For a timeout it also has `timedOut: true`, and the message reads `register() did not finish within N seconds`.
- Everything the module contributed is removed: its registry entries (context actions, interactions, resource views, code editor, dashboard widgets, quick actions, notifications, audit, help, header), its navigation items and its routes. This also applies to a module that threw after it had already added navigation or a route.
- JavaScript cannot cancel a hung `register()`, so the module is marked abandoned. A later call to `addNavigation`, `router.addRoute` or a registry method throws, and Core runs the cleanup again if the promise settles late.

Keep `register()` short. Register your pages, actions and widgets, and load data inside the components when they mount. Public modules (`registerPublic`) run before sign-in, so they use the fixed 30 second limit.

## System name

Core 1.17.23 keeps one system name, the name an authenticator app shows beside a person's account when they set up two-factor sign-in (default `Tec-Tac`, 1 to 60 characters, no colon). `register(context).context.system_name` and `GET /api/tfd/ui/context/` carry it as a string, or `null` on an older Core. It is display text only. The setup answer of `POST /api/tfd/auth/totp/enrollment/` carries it as `issuer`; the sign-in screen has no other source, so it never builds the label from the host name or the address.

System Configuration (`/system/settings`) shows a System name card when Core sends `system_name` in `GET /api/tfd/system/runtime-settings/`: the current name, the default and the length limit. Only a superuser can save a name (`PATCH {"system_name": "Acme IT"}`) or reset it (`PATCH {"system_name": null}`); Core 1.17.24 answers 403 to anyone else, and the page shows the name read-only to them. Core stays the authority: its 400 and 403 messages are shown as sent. A person who set up two-factor before the change keeps their entry; only a new set-up shows the new name.

## Session theme

Core 1.17.24 keeps the theme a person picks in the header for the session. `register(context).context.session_theme` (and `GET /api/tfd/ui/context/`) carries it as `dark`, `light`, `high-contrast` or `null` when none is chosen. It is read-only and additive: the saved theme stays in `preferences.appearance.theme`, and the theme in effect is the session theme when one is set, else the saved theme. Modules read it for display only and do not write it.

## Failure containment

Core renders every module-supplied component inside an error boundary: each routed page, each header item and each dashboard widget. A throw in setup, render, a lifecycle hook, a watcher or an event handler shows a "could not load" state with a Retry button for that component only. The rest of Tec-Tac keeps working. The state clears when the route changes. Core records each capture (newest last, at most 50) in `state.moduleRuntimeErrors`, and Modules shows the provider as a runtime error. Core also sets a last-resort application error handler that logs with the `[TEC-TAC-UI]` prefix.

## Navigation permissions

`addNavigation(item)` accepts an optional `permission` (one code) or `permissions` (a list). The shell hides an item when the user lacks any of them. Superusers always see it, and an item with neither field is shown as before. Without a backend-supplied context there are no permissions, so a gated item is hidden. This is a display rule only. The backend still refuses the request.

`addNavigation(item)` also accepts an optional `tacticalPermission` (UI 0.12.99): one Tactical flag name, or a list in which every flag must be true, for example `{ to: '/agents/pending', label: 'Pending actions', tacticalPermission: 'can_list_pendingactions' }`. The shell reads `context.tactical_permissions` and shows the item only while each flag is strictly `true`, the same test as `context.hasTacticalPermission(flag)`. It follows the context live, so the item appears or disappears when the role changes. A superuser gets no shortcut: Tactical's flags are Tactical's own. Without a backend-supplied context a gated item is hidden. It combines with `permission` and `permissions`, and both rules must pass. An item without the field behaves exactly as before. It is a display rule only. Tactical and Core still refuse the request.

**Contract export (UI 0.12.100).** Browser contract row `ui.authenticated.navigation` lists the addNavigation item field `tacticalPermission` (shipped in UI 0.12.99): one Tactical flag, or a list in which every flag must be strictly `true` in `context.tactical_permissions`. It is read live, with no superuser shortcut, hidden outside a backend context, and additive: an item without the field behaves as before. Core writes the export row; it is the field's exact contract.

Modules cannot remove navigation. `register(context)` has `addNavigation` but no `removeNavigation`, so one module cannot remove another module's items. Core removes the items of a module whose `register()` failed or timed out.

## Module router

`context.router` is a guarded proxy of the Core vue-router instance. It is not the raw router.

- `addRoute(route)` and `addRoute(parentName, route)` are both guarded.
- A path or a name that is already owned is refused. The error names the owner: another module, or "core shell / previously registered route".
- Core sets `meta.dynamicModule` to your module id on every route you add. Do not set it yourself.
- `addRoute` returns the remover, as vue-router does. Core runs the removers when your module is abandoned or fails.
- `addRoute` throws after the module was abandoned (a failed or timed-out `register()`).
- A route path or alias that starts with `/popup/` is refused: that prefix belongs to the shell (UI 0.12.96). The shell adds the popup address itself for a route with `meta.popup`. An alias that another path or alias already owns is refused too.
- Every other member passes through unchanged: `push`, `replace`, `resolve`, `currentRoute`, `getRoutes` and the rest.

## Signed out (UI 0.12.103)

When the session ends (idle timeout, revoked, expired, sign-out), the shell shows the sign-in screen and stops serving modules:

- `loadUiModules` loads no further module. The rest appear in `state.moduleLoad.skipped` with reason `signed-out`.
- `api`, `apiRaw`, `apiBlob` and `apiText` refuse at once with an error of status `401` and code `signed_out`. No request leaves the page and no second session-invalid event is raised, so the first sign-in message ("Your Tec-Tac session expired due to inactivity. Sign in again.") stays on screen.
- Notifications show nothing and store nothing (see `module-notifications.md`).
- Background job follows stop without a notice (see `module-job-follow.md`).

A module treats status 401 as "signed out" and stays silent. It never toasts a 401.

## Background job follow (jobs)

`context.jobs.follow(descriptor)` asks the shell to watch a job after the person leaves the page. See `module-job-follow.md` (UI 0.12.103).

## hasPermission(code)

`context.hasPermission(code)` answers whether the signed-in user holds a Tec-Tac permission code.

- It returns `true` for a superuser, or when the code is in the effective permission set that Core read from `/api/tfd/ui/context/` when the shell loaded. A role change shows after a reload.
- It returns `false` for everyone else, and when no backend context exists.
- This is a display rule only. Use it to hide a button. The backend still refuses the request.

## tacticalOperation(moduleId, operationId, options)

`context.tacticalOperation(moduleId, operationId, { params, body, query, file, signal })` runs one Tactical operation through Core. Core makes the Tactical call on the server and writes the audit row itself (AD-19). Core checks that the module id in the URL declares the operation, that the user holds the Tactical permission and role scope, and that the route is owned. Core cannot tell which module's browser code made the call. The browser shell therefore binds the helper to the calling module: it refuses another module's id, except the core module yours replaces under AD-20, and it refuses every call after a failed or timed-out `register()`. The same guard covers the `api`, `apiRaw`, `apiBlob` and `apiText` helpers your module receives: a path that reaches `/api/tfd/tactical-operations/<other id>/...` is refused, however it is written (encoded, with `..`, in upper case or with a query). This guard stops a module using the shared helpers to name another module. It is not a sandbox against a module that calls `fetch` itself. Core's own permission, scope and honoured-replacement checks stay the authority. Use it instead of calling Tactical routes from the browser. It needs Core 1.17.7 or later and UI 0.12.87 or later. The `query` and `file` options need Core 1.17.13 or later and UI 0.12.91 or later. Public modules (`registerPublic`) do not get it.

```js
const result = await context.tacticalOperation('checks', 'run-checks', { params: { agent_id: id }, body: {} })
if (result.auditRecorded === false) notify('The action ran. Core could not record it in the audit log.')
```

- It sends `POST /api/tfd/tactical-operations/<moduleId>/<operationId>/` with `{ params, body }` (or `{ params, body, query }`, or a multipart form with a file), through `apiRaw`. You never build a token or an auth header.
- Pass your own module id. A module that replaces a core module under AD-20 may also pass that core module's id. Advanced Patch Management (`patchmanagement`), for example, may call `context.tacticalOperation('patching', 'list-updates', ...)` as well as its own id. The shell reads the replaced id from `descriptor.replaces`, else from the `replaces` field of your row in `context.context.module_status`. It takes that snapshot once, before any module's `register()` runs, so a later edit of the descriptor or the row changes nothing. If neither carries it, only your own id works.
- Any other id is refused before any request, with an error whose `status` is 0 and a message that names your module and the ids it may use.
- `api`, `apiRaw`, `apiBlob` and `apiText` refuse the same way (`status` 0, `payload` and `code` null) for a tactical-operations path with another module's id. Every other path passes through unchanged, with the same arguments and return value.
- Both ids must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`. The helper never accepts a path, a slash, a dot or a percent sign.
- `params` is a plain object of string or number values. `body` is a plain object (default `{}`). Anything else is refused before any request, with an error whose `status` is 0.
- `query` is optional: a flat plain object of at most 16 names. Each name matches the id pattern. Each value is a string or a whole number, as text of at most 512 characters with no control characters. Core accepts only the names the operation lists and answers `query_field_not_allowed` or `invalid_query` otherwise. Without a `file`, a call that has `query` sends the JSON body `{ params, body, query }`. A call without `query` still sends exactly `{ params, body }`.
- `file` is optional: a `File`, or a `Blob` that has a non-empty `name` (at most 255 characters, no control characters). A `Blob` without a name, a string, an array or a second file is refused before any request. A name of `params`, `body` or `query` is refused too, because those are the text parts. With a `file` the helper sends `multipart/form-data` built with `FormData`: the text parts `params`, `body` and (only when you pass it) `query`, each the JSON of a plain object, then exactly one file part. The file part is named after the file and carries the same filename (`form.append(file.name, file, file.name)`), which is what an operation with the upload field `{file_name}` expects. The helper sets no `Content-Type`, so the browser writes the multipart boundary. Core checks the size (10 MiB) and type and answers `upload_too_large`, `upload_type_not_allowed`, `upload_not_allowed` or `invalid_upload`. An operation that declares a fixed field instead of `{file_name}` is not covered yet.
- The validation order is: ids, scope, `params`, `body`, then `query` and `file`, then the request. `signal` works with both forms.
- It accepts no headers and no audit field, so it never sends an audit outcome. Core decides what the audit row says.
- It shows no notice itself. Your page decides what to tell the user.

On success it returns `{ ok, status, data, blob, contentType, contentDisposition, filename, audit, auditRecorded }`.

- `data` holds parsed JSON, or text for a text answer. It is `null` for 204 and for a file answer.
- A file answer (an `attachment` disposition, or a type that is not text or JSON) comes back as `blob`, with its `contentType` and `contentDisposition` kept. `filename` is read from `filename*` first, then `filename`.
- `audit` is the `X-Tec-Tac-Audit` header: `recorded`, `not-recorded`, or `''` for a missing or unknown value. `auditRecorded` is `true`, `false` or `null` to match.

On a failed response the `apiRaw` error passes through unchanged: `status`, `payload` and `code`. Core refusal codes such as `tactical_permission_denied` and `object_not_found`, and a 429, stay readable. The error also carries the response `headers` as a non-enumerable property, so a page can read `X-Tec-Tac-Audit` on a 5xx. Core writes "outcome unknown" there.

If the API is served from a different origin than the page, the proxy must expose `X-Tec-Tac-Audit` and `Content-Disposition` (`Access-Control-Expose-Headers`). Otherwise the browser hides them and `audit` stays `''`. Same-origin installs are unaffected.

## Tactical terminal socket (tacticalWebSocket)

`context.tacticalWebSocket.open(moduleId, kind, { agentId, signal })` opens one Tactical terminal for the signed-in person, through a single-use ticket from Core (UI 0.12.102, Core 1.17.31 or later). The module never holds a token. The helper asks for a fresh ticket on every open, checks the answer, and opens `wss://<host>/ws/tfd/agent-terminal/<ticket>/` with no query and no subprotocol. It resolves with a session that has `start`, `input`, `resize`, `kill`, `close` and `on('output' | 'error' | 'info' | 'close', fn)`.

- `moduleId` is the module's own id, or the core module it replaces under AD-20. Another id is refused before any request. `kind` is `agent-terminal`; any other kind is refused.
- A ticket lives 30 seconds and works once. Ask for a new terminal for each terminal tab.
- A terminal the module opened is closed when the module is cleaned up or unloaded. The shell closes every terminal when the Tactical session ends and when the page is left. A module has at most 8 open at once.
- A raw `api`, `apiRaw`, `apiBlob` or `apiText` call to another module's `/api/tfd/tactical-websocket/` path is refused. Use the helper.
- Hide the Terminal tab with `context.hasTacticalPermission('can_use_terminal')`. The helper does not check it; Core and Tactical decide.
- Public modules (`registerPublic`) do not get it.

The full rules, the frames, the close codes (4401, 4003, 4503, 1000 and the rest) and the ticket refusals are in `module-tactical-websocket.md`.

**Contract row (UI 0.12.102, not yet in the export).** Browser contract row `ui.authenticated.websocket` (phase `authenticated`, service `tacticalWebSocket`): operations `open`, `session.start`, `session.input`, `session.resize`, `session.kill`, `session.close` and `session.on`; events `output`, `error`, `info` and `close`; close codes 4401 (`signin-ended`), 4003 (`not-allowed`) and 4503 (`unavailable`) with the messages in `module-tactical-websocket.md`, and 1000 and any other code with the plain close messages there; the ticket route `POST /api/tfd/tactical-websocket/<module_id>/<kind>/tickets/` with exactly `{agent_id}`, and its refusals; a ticket lives 30 seconds and works once, and a new one is asked for each terminal tab; the bound-module rule above; Core 1.17.31 or later and UI 0.12.102 or later. Core writes the export row. This release does not claim the export lists it; `reviews/requests/core.md` asks for it.

## hasTacticalPermission(flag)

`context.hasTacticalPermission(flag)` answers whether Tactical's own role lets the signed-in user do something, for example `can_list_agents`.

- Core computes the flags and sends them as `tactical_permissions` in `GET /api/tfd/ui/context/` (Core 1.17.7). The runtime context carries them as `context.context.tactical_permissions`: a plain object of `can_*` keys with `true` or `false` values. A value that is not a boolean, or a key that does not start with `can_`, is dropped.
- It returns `true` only when the flag is exactly `true` in that map. It returns `false` for an unknown flag, a value that is not a string, an empty map, an older Core and a non-backend context.
- There is no superuser shortcut here. Core already sends every flag as `true` for a superuser, and none for an installer user or a user with no role.
- This is a display rule only. Use it to hide a button (AD-12). Tactical still decides every call.
- It is separate from `hasPermission(code)`, which answers Tec-Tac permission codes and is unchanged.

## tacticalScope()

`context.tacticalScope()` tells a module which clients and sites the signed-in user's Tactical role covers. Use it as a hint, for example to say "you see part of the estate" on a page.

- Core sends `tactical_scope` in `GET /api/tfd/ui/context/` (Core 1.17.17). It needs UI 0.12.93. The runtime context carries it as `context.context.tactical_scope`, next to `tactical_permissions`.
- It returns a fresh object each call: `{ mode, unrestricted, whole_client_count, site_count }`.
- `mode` is `unrestricted`, `clients`, `sites`, `mixed` or `none`. `unrestricted` is `true` only when the mode is `unrestricted`.
- The counts are whole numbers. There are no id lists. Core keeps those.
- An older Core, a failed lookup or a value the UI does not recognise gives `{ mode: 'none', unrestricted: false, whole_client_count: 0, site_count: 0 }`. You do not need a null check.
- This is a display hint only. Tactical and Core decide every call (AD-12). Do not use it to authorise anything.

## codeEditor.languages

`context.codeEditor.languages` is the frozen list of language ids that `create` and `createModel` accept:

- `html`
- `markdown`
- `plaintext`
- `css`
- `yaml`
- `json`
- `powershell`
- `bat`
- `python`
- `shell`
- `typescript`

Any other id throws `Unsupported Tec-Tac editor language`. See [module-code-editor.md](module-code-editor.md) for the editor itself.

## confirm(options)

`context.confirm(options)` asks the person one plain question with Yes and No. It needs UI 0.12.96 and no Core change. Use it before an action that changes or deletes something, or that touches many endpoints. It answers a Promise of `true` (Yes) or `false` (No, Escape, or a click outside the dialog).

```js
const ok = await context.confirm({ question: 'Delete policy Servers?', target: 'Servers' })
if (!ok) return
```

Options:

- `question` (required): plain text, at most 300 characters. A missing or empty question rejects with a `TypeError`.
- `target`: the name the action is about, shown on its own line, at most 200 characters.
- `count`: a whole number of 1 or more. The dialog adds "This affects N endpoints." Any other value is dropped.
- `noun`: the word that follows the count, default `endpoints`, at most 30 characters.
- `detail`: one short extra sentence, at most 400 characters.
- `danger`: `true` only changes how the Yes button looks.
- `yesLabel` and `noLabel`: default "Yes" and "No", at most 24 characters.

Rules:

- Text is shown as text. Tabs, line breaks, other control characters and zero-width characters are removed. A text over its limit is cut.
- The dialog is titled "Are you sure?", takes focus on No and has no input field. Do not ask people to type a name, a hostname or a number. A bulk action names the endpoint count with `count`.
- Requests queue and show one at a time. A call from a module shows a small line "Asked by <your module id>". The shell adds it, so a module cannot name another asker.
- `confirm` is bound to your module. It is refused after a failed or timed-out `register()`.
- A request still open when the person signs out answers No.
- The dialog does not change who may do what. Permissions, scope, caps and audit rows stay as they are. Hiding or confirming is never authorisation.
- A context action handler receives the same helper as `context.confirm` (see [context-actions.md](context-actions.md)).
- Your own typed or custom confirmation dialog keeps working until you move to this one.

## Popup mode

A module can open one of its pages in its own window, without the Tec-Tac chrome. It needs UI 0.12.95 or later and no Core change. Ask the runtime for the address with `context.popupHref(path)` and open the window yourself:

```js
const url = context.popupHref(`/take-control/${agentId}/vnc`)
if (url) window.open(url, 'tec-tac-vnc', 'popup,width=1100,height=700')
```

`popupHref(path)` returns an absolute address of the form `https://<host>/tec-tac/#/popup/<your module id><path>`, or `''` when it cannot build the address safely. It refuses a query string, `..`, control or zero-width characters, and a path that starts with `/popup`. It always names your own module, so one module cannot point at another module's window. It opens nothing: keep your own `window.open` call and its window features. It is refused after a failed or timed-out `register()`. Public modules (`registerPublic`) do not get it.

A route opens in a popup only when it says so in its `meta`:

```js
context.router.addRoute({
  path: '/take-control/:agent_id/vnc',
  name: 'take-control-vnc',
  component: VncView,
  meta: { popup: true, permission: 'example.view' },
})
```

- `meta.popup: true` lets the route open in a popup. A route without it has no popup address, and a popup request for it shows a refusal. Leave it off a route that is not designed for a bare window.
- `meta.permission` (one Tec-Tac code) or `meta.permissions` (a list) names the codes the person must hold. The rule matches navigation items: a superuser passes, otherwise every code is required, and a context that did not come from the backend is denied. A person who may not open the route sees a plain refusal before your component renders (AD-12). The backend stays the authority.

The popup address uses the route path, so the module id appears twice: `/tec-tac/#/popup/take-control/take-control/12/vnc` opens `/take-control/12/vnc`.

**Optional parameters (UI 0.12.97).** A route path may use the router's own parameter syntax: `':name'`, an optional `'(...)'` group and one modifier (`?`, `*` or `+`) right after it. `/endpoints/:agentId?` opens at `/tec-tac/#/popup/endpoints/endpoints/<agent id>` and, with no id, at `/tec-tac/#/popup/endpoints/endpoints`. Any other `?`, and `#`, whitespace, `..`, a backslash, control and zero-width characters, still give the route no popup alias. Before 0.12.97 the `?` of an optional parameter was refused, so such a route got no alias and its window said "This page cannot open in its own window."

**A route that cannot get a popup alias is never skipped in silence.** The shell writes a `console.warn` that names the module, the route path and the reason. If a popup hash still does not match a module route after the modules loaded, or the owner module did not load, the popup window warns in the browser console with the hash, the module id, the parsed path and the popup aliases that are registered. Read that first when a window refuses.

**What a popup loads.** Only the owning module's bundle and its hard dependencies from `tec_tac.json` (`dependencies`), dependencies first. `scripts/sync-modules.sh` copies those ids into the module's descriptor in `modules.json` as `dependencies`. Until that sync runs, a descriptor with no `dependencies` field loads the module alone. A hard dependency that the person may not use, or that has no authenticated entry, is left out, so your module must cope without it. Optional dependencies (`optional_dependencies`) are not loaded in a popup: check `modules.isActive(id)` and degrade without them.

**Modules that publish into your page (UI 0.12.97).** A page such as the endpoint dossier shows tabs that other modules publish into its placements (for example `endpoint.detail-tabs`). Those modules do not depend on yours, and the shell cannot tell who publishes into a placement before it loads them, so a popup loads them only when the owner's route asks. Add `popupPublishers` to the route's `meta`:

```js
meta: { popup: true, popupPublishers: true }            // every other enabled module the person may use
meta: { popup: true, popupPublishers: ['checks', 'alerts'] }  // just these module ids
```

The shell loads the owner and its hard dependencies first, reads `popupPublishers` from the matched route, then loads the extra modules (each with its own hard dependencies first) before it replays the popup address, so the page mounts with every tab registered. Modules already loaded, the owner, modules with no authenticated entry, modules the person may not use and ids that are not module ids are skipped. The extra modules get no popup alias and keep every loader guard (register time limit, failure containment, route conflict checks, the reserved `/popup/` prefix). A failure in an extra module never refuses the popup; it shows in the module load list. Cost: each extra module is one more bundle request and one more `register()`, so a route that does not need them leaves the field off and loads exactly what it loaded before. Take Control and Remote Background do not set it.

**Contract export (UI 0.12.100).** Browser contract row `ui.authenticated.popup` lists `route.meta.popupPublishers` (shipped in UI 0.12.97): `true`, or an array of module ids. It is opt-in per route. The shell reads it from the matched route after the owner registers and before the popup address is replayed. The route-path rule (a path under `/popup/` is refused; a route that cannot get a popup alias warns in the console) is part of the same row and shipped in UI 0.12.97. Core writes the export row; this section is the exact contract.

**What a popup does not load.** Public modules, the dashboard, notice polling, header contributions and the `register()` of any other module (unless the owner's route sets `popupPublishers`, above). The shell still verifies the session, reads `GET /api/tfd/ui/context/`, and gives your module the full runtime context (`api`, `tacticalOperation`, and the rest).

**What the popup window shows.** No brand header, top bar, navigation rail, navigation menu, notice drawer, help drawer or quick actions. It keeps the toast stack (your `notifications` calls still show), the unsaved-changes dialog, the theme and text size, and session tracking. The idle timeout remains Core's rule.

**When a popup cannot open.** The window shows "This page is not available to you." when the module is skipped, not installed, disabled, failed to load, or the person lacks the route's permission. It shows "This page cannot open in its own window." when the route does not exist or lacks `meta.popup`. Neither case makes a request for the module's page.

Expect a popup to load its own bundle and its dependencies, not the whole shell. Measure the boot in your own release before you claim a figure.
