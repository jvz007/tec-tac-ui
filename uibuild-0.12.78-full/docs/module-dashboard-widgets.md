# Tec-Tac module dashboard widgets

Tec-Tac Core owns dashboard records, private/shared visibility, user defaults and dashboard layout. Authenticated modules contribute reusable widgets through the `dashboardWidgets` runtime capability.

## Runtime contract

Authenticated modules receive a module-scoped registry:

```js
await plugin.register({ dashboardWidgets, ...runtime })
```

Register a widget with a provider-namespaced ID:

```js
const registration = dashboardWidgets.register({
  id: 'alerts.active',
  title: 'Active Alerts',
  description: 'Current active alerts by severity.',
  category: 'Monitoring',
  permission: 'alerts.view',
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 12, h: 8 },
  component: AlertsDashboardWidget,
})
```

The ID must begin with the current module ID followed by a dot. This prevents cross-module collisions.

## Widget component props

Core renders the registered Vue component with:

```js
props: {
  settings,   // saved instance settings object
  dashboard,  // current dashboard metadata/layout
  editable,   // true while the dashboard owner/admin is editing
}
```

A widget owns its data retrieval and presentation. It should use the authenticated module runtime API helpers rather than reading Tactical authentication state directly. While a dashboard is being edited, a widget may emit `update:settings` with a plain object; Core writes that object into the widget instance settings in the dashboard draft.

## Permissions

If `permission` is supplied, Core filters the widget from the catalogue and from runtime resolution when the current user does not have that permission. A shared dashboard can therefore contain a saved widget instance that another viewer cannot resolve. Core preserves that saved instance but does not render the provider component for the unauthorized viewer.

## Layout

Core stores per-instance:

- `instance_id`
- `widget_id`
- width `w` from 1 to 12 columns
- height `h` from 1 to 12 layout units
- module-owned `settings` object

The current dashboard editor supports drag reordering and width/height resizing. Modules should not persist their own dashboard placement.

## Lifecycle

`dashboardWidgets.register()` returns a disposable handle. Registrations are module-scoped. If module registration fails, Core clears widgets contributed during that registration attempt.

```js
const handle = dashboardWidgets.register({...})
handle.dispose()
```

Modules should not import another module's widget component or mutate Core dashboard records directly.

## Visibility model

Dashboard visibility is independent of widget registration:

- `private`: visible only to the user who created the dashboard.
- `shared`: visible to all authenticated Tec-Tac users.

The owner may switch between private and shared after creation. Widget-level permission checks still apply to every viewer.
