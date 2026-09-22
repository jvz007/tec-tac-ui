# Module availability runtime

Authenticated Tec-Tac UI modules receive a read-only `modules` service through `register(context)`. It exists to answer cheap optional-integration questions from the startup snapshot; it does not call Module Manager, Public Contracts, or another module API.

```js
export async function register({ modules }) {
  if (!modules.isActive('cybercns')) return
  // Add CyberCNS-specific presentation only when its provider is active.
}
```

API:

```text
modules.list()
modules.get(id)
modules.has(id)
modules.isInstalled(id)
modules.isEnabled(id)
modules.isActive(id)
modules.version(id)
modules.satisfies(id, constraint)
```

Modern Core supplies installed modules including disabled modules through `/api/tfd/ui/context/`. Compatibility with older Core versions falls back to the deployed UI manifest, which can prove that a module is active but cannot distinguish disabled from missing. Either state is therefore safely treated as unavailable for optional UI enrichment.

The service is a startup snapshot. Backend operations must still resolve the provider's capability at execution time because a module can be disabled, removed, become unhealthy, or become version-incompatible after the browser loaded.

See the Framework document `docs/optional-module-integrations.md` for the full UI + backend degradation contract and CyberCNS/Endpoints example.
