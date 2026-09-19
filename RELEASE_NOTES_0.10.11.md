# Tec-Tac UI 0.10.11

Adds Core-owned authenticated raw/file request helpers to the dynamic module runtime.

- Keeps existing `api(path, options)` behavior unchanged.
- Adds `apiRaw()` returning the native authenticated `Response`.
- Adds `apiBlob()` and `apiText()` convenience helpers.
- Centralizes Tactical Authorization, credentials, 401 session invalidation and non-2xx error handling.
- Raw requests do not force JSON `Accept` or `Content-Type`, supporting PDFs, HTML/text, images, exports, binary bodies and `FormData` uploads.
- Documents the extension DRF authentication contract and prohibits direct module dependence on `access_token`/localStorage.
