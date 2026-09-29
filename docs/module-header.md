# Module header contributions

Authenticated Tec-Tac modules can contribute small UI components to the Core top bar through the `header` service supplied to `register(context)`.

Use this for compact global status/action surfaces such as an Alerts bell. Do not use it for full navigation, large controls, or page content.

```js
export default {
  async register({ header }) {
    header.register({
      id: 'alerts.bell',
      label: 'Alerts bell',
      order: 100,
      permission: 'alerts.view',
      component: AlertsBell,
      props: ({ state }) => ({ currentUser: state.context.user }),
    })
  },
}
```

## Contract

- IDs must be namespaced to the provider module.
- A Vue component is required.
- `permission` is optional UI gating; backend authorization remains authoritative.
- `visible(context)` is an optional synchronous visibility predicate.
- `props` may be an object or a synchronous function of the Core header context.
- Core sorts by `order`, then label/id, and renders at most six module header contributions.
- Core owns top-bar placement and layout.
- A module cannot unregister another module's contribution.
- Failed module registration clears partial header contributions from that module.
- When the module is disabled/unloaded, it contributes nothing.

Header components should be compact, keyboard accessible, and must not perform heavy startup data loading during registration.
