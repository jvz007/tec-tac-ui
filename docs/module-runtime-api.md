# Authenticated module runtime API

Tec-Tac authenticated UI modules receive Core-owned request helpers in `register(context)`. Modules must use these helpers instead of reading `localStorage.access_token`, constructing Tactical `Authorization` headers, or duplicating session-expiry handling.

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

