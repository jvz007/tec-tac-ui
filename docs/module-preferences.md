# Module user preferences (`modulePreferences`)

UI 0.12.106, Core 1.17.35 or later (`core.module_preferences` 1.0.0). A module keeps small per-person choices through Core, such as whether a header is collapsed. Each choice belongs to one person, one module and one name. Core keeps it, so the choice follows the person to another browser.

Only the person's own display choices belong here. Do not store a secret, token, password, key or personal data. Core stores these values as they are, and the shell does not check what they mean.

## Use

```js
const saved = await context.modulePreferences.get('header-collapsed', false)
await context.modulePreferences.set('header-collapsed', true)
const all = await context.modulePreferences.getAll()   // a new object of { name: value }
await context.modulePreferences.remove('header-collapsed')
```

- `get(name, fallback)` returns the stored value, or `fallback` when the person has none. It reads from Core on every call; nothing is cached.
- `getAll()` returns every preference this module keeps for the person, as a new object.
- `set(name, value)` stores one value and returns what Core stored.
- `remove(name)` deletes one preference and returns `true` when Core removed a row.

All four are asynchronous and reject when refused.

## The module id is bound

The module id is the loader's own descriptor id. Nothing you pass names a module, so a module cannot read or change another module's preferences. A replacement module under AD-20 has no exception: it keeps its own preferences, and it cannot reach the module it replaces.

The helper calls Core only through the module's own guarded `api()`. The shell also refuses a raw `api`, `apiRaw`, `apiBlob` or `apiText` path that reaches `/api/tfd/module-preferences/<id>/` for any id other than the module's own. The check decodes the path first, so encoded, dotted and backslash forms are refused too.

`registerPublic(context)` does not get `modulePreferences`. A public module has no signed-in person.

## Limits

These are checked in the browser before any request. Core checks them again and stays the authority.

- **Name:** 1 to 64 characters, matching `[a-z0-9][a-z0-9._-]{0,63}`: a lower-case letter or digit first, then lower-case letters, digits, `.`, `_` or `-`. Anything else is refused with `invalid_name` (status 400) and no request is sent.
- **Value:** plain JSON only: `null`, booleans, finite numbers, strings, arrays and plain objects. At most 4 KiB when stored (4096 bytes of JSON in UTF-8), and at most 5 levels deep (the outermost array or object is level 1). Anything else is refused with `invalid_value` (status 400) and no request is sent.
- **Count:** Core keeps at most 50 names per module for one person. A 51st name is refused by Core with `preference_limit` (status 400).
- **Writes:** Core limits how often the person can write. A refused write comes back as status 429.

## Refusals

| When | What the module gets |
| --- | --- |
| The name or value fails the limits above | An error with code `invalid_name` or `invalid_value`, status 400, no request |
| The person is signed out | An error with status 401 and code `signed_out`, no request |
| The module failed or timed out during `register()` | A plain error; no request |
| The module was unloaded (switched off while the page is open) | A plain error; no request |
| The module id is not an installed, enabled module | Core answers 404 `module_not_found` |
| Core refuses a name or value, or the 50-name limit | Core's 400 with `invalid_name`, `invalid_value` or `preference_limit` |
| Too many writes | Core answers 429 |

A module treats status 401 as "signed out" and stays silent, as with every other helper (see `module-runtime-api.md`).

## Lifecycle

The loader calls the helper's `clear()` when the module is unloaded or fails. After that, every call is refused. `clear()` is for the shell; a module has no need to call it.

Nothing is stored in the browser: no `localStorage`, no `sessionStorage` and no cache. A choice a module keeps here survives a page reload and a new browser, because Core holds it.

## Contract row

The browser contract row `ui.authenticated.modulePreferences` (phase `authenticated`, service `modulePreferences`) lists the operations `get`, `getAll`, `set` and `remove`, with the own-id rule, the limits and the refusals above. It needs Core 1.17.35 or later and UI 0.12.106 or later, and has no `registerPublic` access. Core writes the export row; `reviews/requests/core.md` asks for it. This release does not claim the export lists it.

## Remote Background header (planned)

Remote Background will read and write its header and tab collapse through `context.modulePreferences` after a signed UI 0.12.106 and Core 1.17.35 (`reviews/requests/core-modules.md`). That is module work and is not part of this release.
