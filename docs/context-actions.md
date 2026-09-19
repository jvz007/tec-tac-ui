# Tec-Tac UI Context Actions

**Proposed UI baseline:** 0.10.7+

Tec-Tac UI owns a browser-side contribution registry for actions that modules want to expose on shared resources without importing another module's UI implementation.

## Core rule

Provider modules register an action through the `contextActions` object passed to `register(context)`. Consumer modules query the same Core-owned registry by resource and placement.

Provider:

```js
export default {
  id: 'provider-module',
  async register(context) {
    const { contextActions } = context
    contextActions?.register({
      id: 'provider-module.open',
      resource: 'endpoint',
      label: 'Open Provider',
      group: 'integrations',
      order: 100,
      placements: ['endpoint.context-menu'],
      selection: { min: 1, max: 1 },
      permission: 'provider.use',
    }, async ({ resource, selection }) => {
      // Provider owns execution.
    })
  },
}
```

Consumer:

```js
const actions = contextActions?.list({
  resource: 'endpoint',
  placement: 'endpoint.context-menu',
  context: {
    resource: endpoint,
    endpoint,
    selection: [endpoint],
    resource_type: 'endpoint',
  },
}) || []
```

Invoke through Core:

```js
await contextActions.execute(action.id, actionContext)
```

## Descriptor contract

Required:

- `id` — stable action ID; must start with `<provider-module>.`
- `resource` — resource type such as `endpoint`, `client`, `site`, `alert`, `patch`.
- `label` — user-visible action label.
- `placements` — one or more supported contribution slots.
- execution handler — second argument to `register(...)` or descriptor `execute` function.

Optional:

- `icon`
- `group` — grouping label; defaults to `integrations`.
- `order` — numeric sort order inside the group.
- `permission` — Tec-Tac permission code used for UI availability only. Backend authorization remains authoritative.
- `dangerous` — UI hint for destructive operations.
- `selection: { min, max }`
- `visible(context)` — synchronous visibility predicate.
- `enabled(context)` — synchronous availability predicate; may return `false` or `{ enabled:false, reason:'...' }`.
- `metadata` — serializable provider metadata.

## Initial placements

Endpoints consumes:

- `endpoint.context-menu`
- `endpoint.detail-header`

Future consumers may define additional placements, for example:

- `endpoint.toolbar`
- `client.context-menu`
- `site.context-menu`
- `alert.context-menu`
- `patch.context-menu`

Placements are stable public UI contracts once documented.

## Selection semantics

The action context uses:

```js
{
  resource_type: 'endpoint',
  resource: endpoint,
  endpoint,
  selection: [endpoint],
}
```

For multi-select, `selection` contains all selected public resource objects. Providers must not rely on another module's Vue component state or private objects.

## Lifecycle and failure behavior

- Actions are scoped to the provider module that registered them.
- A provider cannot register an ID outside its own `<module-id>.` namespace.
- If provider registration fails, Core clears any partial actions from that module.
- Disabled/unloaded modules never register actions because their UI module is not loaded.
- Missing providers therefore disappear naturally from consumers.
- Optional UI integration failures must not prevent the consumer module from loading.
- Backend authorization remains authoritative even when the UI action is permission-gated.

## Public Contracts integration

This file defines a stable UI contract and should be listed in the Developer Contract catalog alongside the backend capability/scheduler contracts. The catalog should describe the `contextActions.register`, `contextActions.list`, and `contextActions.execute` browser APIs and point module authors to this document.

Registered browser actions are runtime UI state. If live enumeration is added to the Public Contracts page later, it should be populated from the browser registry rather than pretending backend capability registration owns UI contributions.
