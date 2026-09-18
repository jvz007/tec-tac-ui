# Tec-Tac UI 0.2.1

## Public extension pages

Adds a second extension UI lifecycle for unauthenticated pages.

Public module descriptors are loaded from `/tec-tac/modules/modules.json` before Tactical session verification. A public entry must export `registerPublic(context)` and can register routes only inside `/public/<extension-id>` through `addPublicRoute(route)`.

The public runtime receives only:

```text
Vue
app
descriptor
addPublicRoute(route)
publicApi(path, options)
```

It does not receive Tactical session state, RBAC helpers, authenticated navigation, or the authenticated `api()` helper. `publicApi()` deliberately omits the Tactical Authorization token.

Authenticated module loading remains unchanged and still uses `register(context)`.

## Public shell

Routes below `/public/...` render without the normal authenticated sidebar/session gate. Anonymous users can open those routes directly; authenticated users can open the same routes as well.

## Module management

The Modules workspace now distinguishes Admin UI and Public UI capability in the catalog, module detail panel, and package inspection dialog.
