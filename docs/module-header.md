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
- `permission` / `permissions` may narrow UI gating. If omitted, Core automatically uses the module permissions declared by the authenticated module descriptor; a contribution is never allowed to bypass its module permission boundary.
- Header contributions render only while the authenticated context is trusted as backend-supplied. If that provenance is absent or degraded, the slot fails closed.
- `visible(context)` is an optional synchronous visibility predicate.
- `props` may be an object or a synchronous function of the Core header context.
- Core sorts by `order`, then label/id, and renders at most six module header contributions.
- Core owns top-bar placement and layout.
- A module cannot unregister another module's contribution.
- Failed module registration clears partial header contributions from that module.
- A contribution the user lacks the permission for is hidden (AD-12): it is not listed.
- Each header item renders inside a Core error boundary. If the component throws in setup, render, a hook, a watcher or an event handler, the top bar shows a small warning marker (with the provider and message in its tooltip) in place of that item and nothing else changes. The failure is recorded against the provider so Modules reports it as a runtime error.
- When the module is disabled/unloaded, it contributes nothing.

Header components should be compact, keyboard accessible, and must not perform heavy startup data loading during registration.
