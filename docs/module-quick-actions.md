# Module Quick Actions

Tec-Tac UI 0.11.13 adds a Core-owned, per-user Quick Actions bar in the authenticated top bar.

Quick Actions are shortcuts, not an authorization boundary. Core stores the user's pins and evaluates the provider's current permission/availability state every time an action is shown or executed. Backend authorization remains authoritative.

## Module runtime contract

Authenticated modules receive a module-scoped `quickActions` object in `register(context)`:

```js
export async function register({ quickActions, api }) {
  quickActions.register({
    id: 'probe.scan-now',
    label: 'Scan now',
    icon: '⌁',
    description: 'Start a discovery scan on a configured probe.',
    permission: 'probe.manage',
    directPin: false,
  }, async ({ params }) => {
    await api(`/api/tfd/probe/probes/${params.probe_id}/scan/`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  })
}
```

Action IDs must begin with the provider module ID (`<module-id>.`). Registered descriptors support:

- `id` — stable namespaced action ID;
- `label` — default button label;
- `icon` — compact top-bar glyph;
- `description` — operator-facing purpose;
- `group` and `order` — catalogue organization;
- `permission` — Tec-Tac extension permission required for use;
- `dangerous` — Core asks for confirmation before running a pinned action;
- `directPin` — when false, the generic manager does not offer an unconfigured pin;
- `defaultParams` — small JSON-serializable defaults for directly pinned actions;
- `visible(context)` / `enabled(context)` — optional live availability checks.

The execution callback receives `{ params, pin, source }`. Modules must still call their normal authenticated API and must not treat a Quick Action as permission to bypass backend checks.

## Parameterized shortcuts

For shortcuts such as **Scan Client 2**, register the generic action with `directPin: false`, then let the module's own UI pin a configured instance after the operator selects the target:

```js
quickActions.pin('probe.scan-now', {
  label: 'Scan Client 2',
  params: { probe_id: 'probe-2' },
})
```

This stores only the action ID, display metadata and bounded JSON parameters in the user's Core preference profile. It does not store executable code, URLs to arbitrary endpoints, shell commands, tokens or credentials.

## Navigation shortcuts

Core navigation entries can be added or removed from Quick Actions from the navigation context menu or the Quick Actions manager. Route shortcuts are limited to navigation routes already visible to the authenticated user.

## Persistence

Pins are stored under the existing server-backed preference document:

```text
extensions.core.quick_actions
```

Core currently permits module-specific/dynamic data below `extensions`; no separate storage API or browser-only durable state is introduced.

## Limits and lifecycle

- maximum 24 pinned shortcuts per user;
- action parameters are limited to 8 KiB JSON per pin;
- if a provider module is disabled, removed or not loaded, its saved shortcut remains visible in the manager but is disabled;
- removing a provider does not execute or rewrite its saved parameters;
- module cleanup unregisters the runtime action; the user's pin can be removed normally from the manager.
