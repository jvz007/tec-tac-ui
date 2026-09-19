# Tec-Tac UI Context Interactions

`contextInteractions` is the Core-owned browser runtime contract for cross-module drag/drop interactions. It complements `contextActions`: actions expose commands for a resource, while interactions expose supported drag source -> drop target behavior without consumers importing provider UI internals.

## Provider contract

Authenticated modules receive a module-scoped `contextInteractions` object in `register(context)`. Register IDs must be namespaced to the provider module, for example `checks.grouping`.

```js
contextInteractions.register({
  id: 'checks.grouping',
  surface: 'endpoint.workspace',
  sourceTypes: ['check'],
  targetTypes: ['endpoint-group'],
  permission: 'checks.manage',
  order: 200,
  canDrop({ source, target }) {
    return source.id !== target.id
  },
  async drop({ source, target }) {
    // provider-owned execution
  },
})
```

Descriptor fields:

- `id` - required, provider-namespaced ID.
- `surface` - required shared UI surface.
- `sourceTypes` / `sourceType` - one or more accepted drag source types.
- `targetTypes` / `targetType` - one or more accepted drop target types.
- `permission` - optional Core permission gate.
- `order` - optional ordering hint, default `500`.
- `canDrop(context)` - optional fail-closed availability test.
- `drop(context)` / second argument to `register()` - required execution handler.
- `metadata` - optional provider metadata.

## Consumer contract

Consumers query the registry by surface/source/target and render only returned interactions. Execute by ID through the same module-scoped registry.

```js
const matches = contextInteractions.list({
  surface: 'endpoint.workspace',
  source: { type: 'check', id: 'disk-health' },
  target: { type: 'endpoint-group', id: 'servers' },
})

await contextInteractions.execute(matches[0].id, { source, target })
```

## Ownership and safety

- Core owns the registry.
- Providers own execution.
- Consumers must not import provider UI internals.
- One module cannot unregister another module's interactions.
- Permission checks are enforced by Core when declared.
- `canDrop()` errors fail closed and surface as a disabled interaction reason.
- If module registration fails, Core clears interactions registered by that module during startup.
