# Module Resource View Contributions

Tec-Tac UI 0.12.0 adds the Core-owned `resourceViews` registry for optional cross-module visual integration.

Use it when one module needs to add information to another module's resource page without importing the provider module's UI code. Typical examples are CyberCNS vulnerability information on an endpoint, SentinelOne health on an endpoint, backup state on a server, or warranty information on an asset.

## Design boundary

The consumer owns the page and defines stable resource/placement names. Providers register contributions to those named surfaces.

```text
Endpoints owns endpoint page
        |
        +-- endpoint.summary
        +-- endpoint.details
        +-- endpoint.security
        +-- endpoint.tabs
                 ^
                 |
        CyberCNS resourceViews contribution
```

A consumer must continue working when a provider is missing, disabled, permission-gated, incompatible, or removed. `resourceViews` is a presentation contract only; backend capability checks remain authoritative for data/execution.

## Provider registration

Authenticated modules receive a module-scoped `resourceViews` object in `register(context)`.

```js
export async function register({ Vue, resourceViews }) {
  const CyberCnsSummary = {
    props: ['endpoint'],
    template: `<section><b>CyberCNS</b><span>{{ endpoint?.name }}</span></section>`,
  }

  resourceViews.register({
    id: 'cybercns.endpoint-security-summary',
    resource: 'endpoint',
    placement: 'detail.security',
    label: 'CyberCNS vulnerability summary',
    order: 200,
    permission: 'cybercns.device.view',
    component: CyberCnsSummary,
    visible: ({ resource }) => Boolean(resource?.id),
    props: ({ resource }) => ({ endpoint: resource }),
  })
}
```

Rules:

- `id` must be namespaced with the provider module ID.
- `resource` and `placement` are consumer-owned stable names.
- `component` is required, except at `endpoint.grid-columns` (see Grid columns).
- `permission` is optional; Core hides the contribution if the current user lacks it (AD-12: hidden when denied, everywhere).
- `visible(context)` is optional and must be cheap. Do not perform API calls in it.
- `props` may be a static object or a cheap function of the consumer context.
- `order` defaults to `500`.
- registration is automatically cleaned up if module registration fails.

## Consumer rendering

The consumer queries only the surface it owns:

```js
const views = computed(() => resourceViews.list({
  resource: 'endpoint',
  placement: 'detail.security',
  context: { resource: endpoint.value },
}))
```

Render the returned components using normal Vue dynamic components:

```html
<component
  v-for="view in views"
  :key="view.id"
  :is="view.component"
  v-bind="view.resolvedProps"
/>
```

Consumers must not import provider UI source directly and must not require a provider to exist.

## CyberCNS + Endpoints pattern

CyberCNS should be an optional provider, not a hard UI dependency of Endpoints.

- CyberCNS installed and enabled: its contribution is registered and Endpoints renders it.
- CyberCNS disabled: its UI module does not register, so Endpoints simply has no CyberCNS contribution.
- CyberCNS removed: same result; Endpoints continues normally.
- CyberCNS permission unavailable: Core omits the contribution for that user.

For backend data or operations, Endpoints must still use the Framework capability contract, for example `get_capability('cybercns.endpoint_security', required=False)`. Browser availability is not authorization and is not proof that the backend provider is healthy.

## Endpoints placements

Endpoints owns the live placement ids below. The `detail.*` names in the generic examples on this page are illustrations of the naming convention. For the endpoint page, use these.

| Placement | Resource | What you register | Context that `props()` and `visible()` receive | Props to bind |
|---|---|---|---|---|
| `endpoint.summary` | `endpoint` | A component, shown in the summary area | `{ resource: endpoint }` | `{ endpoint }` |
| `endpoint.tabs` | `endpoint` | A component, shown as a tab | `{ resource: endpoint }` | `{ endpoint }` |
| `endpoint.grid-columns` | `endpoint` | A column with a `load` function and no component | `{ resource: endpoint }` for `visible()` | none: see Grid columns |

To read the agent id from the endpoint, use `endpoint.agent_id`. If that is missing, use `endpoint.resource_id` after the `tactical:` prefix (`tactical:abc123` gives `abc123`). Checks and scoutdns read it this way.

## Grid columns

A module adds a column to the Endpoints grid with `resourceViews.register()` at `endpoint.grid-columns`. It supplies data, not a component. Endpoints asks for a page of agents, and each column answers for the whole page in one call.

```js
resourceViews.register({
  id: 'checks.failing',
  resource: 'endpoint',
  placement: 'endpoint.grid-columns',
  label: 'Checks failing',
  order: 300,
  permission: 'checks.view',
  sortable: false,
  filterable: false,
  cell: FailingBadge,
  async load(agentIds, { resource, placement, context, signal }) {
    const counts = await fetchCounts(agentIds, signal)
    return Object.fromEntries(agentIds.map((id) => [id, counts[id] ?? 0]))
  },
})
```

Rules:

- `load` is required at this placement and accepted only here. Registering without it is an error, and so is giving `load` to any other placement. Every other placement still requires `component`.
- `cell` is optional: a small Vue component for a badge.
- `sortable` and `filterable` are strict booleans and default to `false`.
- `id` starts with your module id. `label`, `order` (default `500`), `permission` and `visible(context)` work as on every other placement.
- `load(agentIds, { resource, placement, context, signal })` returns an object keyed by agent id. It runs once per page, with string ids and no duplicates. An id you were not given is dropped from the answer.
- The host pages at most **100 ids** per call. Asking for more is a developer error and throws a `RangeError`.
- Columns load in parallel, so one slow column never delays another.
- A thrown error, a rejection or an answer that is not an object gives the status `failed`. Hitting the time limit gives `timeout` and aborts `signal`. The limit is the module register time limit from the runtime context (30 seconds by default). In both cases the host shows a quiet dash. An agent id missing from a good answer also shows a dash.
- Permission is checked when the columns are listed and again just before `load` runs. A column the user may not see is not listed and is not called (AD-12).

Host side (Endpoints). The module-scoped `resourceViews` object offers two more methods:

- `gridColumns({ resource = 'endpoint', ids, context })` returns the visible columns, sorted by order, label and id. With `ids` (the column ids of a saved view) it returns them in that order and silently drops an unknown, hidden or removed id.
- `loadGridColumns({ columns, agentIds, context, signal })` returns an object keyed by column id. Each value is a promise that never rejects and resolves `{ id, status: 'ready' | 'failed' | 'timeout', values: { [agentId]: value } }`. Show a placeholder in the cell until the promise settles.

A saved view stores only the column id. When a module is disabled or removed, its column is not returned, so Endpoints resolves saved ids through `gridColumns({ ids })`.

This is a display contract. The backend still decides every call.

## Consumer placement naming

Use stable, semantic placement names. Recommended convention:

```text
<surface>.<area>
```

Examples:

```text
detail.summary
detail.security
detail.operations
detail.tabs
list.after-primary
```

Do not name placements after a provider module such as `detail.cybercns`; the placement belongs to the consumer surface, not the provider.

## Performance

`resourceViews.register()` and `resourceViews.list()` must remain local and cheap. Provider data should load inside the contributed component when it mounts, not during module `register()` or `visible()` evaluation.
