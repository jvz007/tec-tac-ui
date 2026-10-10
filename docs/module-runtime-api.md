# Authenticated module runtime API

Tec-Tac authenticated UI modules receive Core-owned request helpers in `register(context)`. Modules must use these helpers instead of reading `localStorage.access_token`, constructing Tactical `Authorization` headers, or duplicating session-expiry handling.

The `resourceViews` registry also takes grid columns at `endpoint.grid-columns` (UI 0.12.93); see `module-resource-views.md`. This page also covers [the module router](#module-router), [`hasPermission(code)`](#haspermissioncode), [navigation](#navigation-permissions) and [`codeEditor.languages`](#codeeditorlanguages).


## Authenticated runtime context

`register(context)` receives the current authenticated Core context directly as `context.context`. The same object remains available through `context.state.context` for compatibility. Treat both as read-only runtime state.

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

## Failure containment

Core renders every module-supplied component inside an error boundary: each routed page, each header item and each dashboard widget. A throw in setup, render, a lifecycle hook, a watcher or an event handler shows a "could not load" state with a Retry button for that component only. The rest of Tec-Tac keeps working. The state clears when the route changes. Core records each capture (newest last, at most 50) in `state.moduleRuntimeErrors`, and Modules shows the provider as a runtime error. Core also sets a last-resort application error handler that logs with the `[TEC-TAC-UI]` prefix.

## Navigation permissions

`addNavigation(item)` accepts an optional `permission` (one code) or `permissions` (a list). The shell hides an item when the user lacks any of them. Superusers always see it, and an item with neither field is shown as before. Without a backend-supplied context there are no permissions, so a gated item is hidden. This is a display rule only. The backend still refuses the request.

Modules cannot remove navigation. `register(context)` has `addNavigation` but no `removeNavigation`, so one module cannot remove another module's items. Core removes the items of a module whose `register()` failed or timed out.

## Module router

`context.router` is a guarded proxy of the Core vue-router instance. It is not the raw router.

- `addRoute(route)` and `addRoute(parentName, route)` are both guarded.
- A path or a name that is already owned is refused. The error names the owner: another module, or "core shell / previously registered route".
- Core sets `meta.dynamicModule` to your module id on every route you add. Do not set it yourself.
- `addRoute` returns the remover, as vue-router does. Core runs the removers when your module is abandoned or fails.
- `addRoute` throws after the module was abandoned (a failed or timed-out `register()`).
- Every other member passes through unchanged: `push`, `replace`, `resolve`, `currentRoute`, `getRoutes` and the rest.

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
