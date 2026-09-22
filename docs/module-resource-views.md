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
- `component` is required.
- `permission` is optional; Core hides the contribution if the current user lacks it.
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
