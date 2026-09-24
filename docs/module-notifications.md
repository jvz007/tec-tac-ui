# Module notifications / toast contract

Tec-Tac UI Core owns the authenticated notification surface. Modules must use the module-scoped `notifications` runtime contract instead of creating their own toast library, overlay, alert banner, or global DOM element.

This contract is intended for short-lived operator notices such as:

- report generation completed;
- scan or synchronization completed;
- background action failed;
- configuration saved;
- a warning requires operator attention;
- an alert has been received while the module UI is active.

Authenticated notifications are shown immediately as browser toasts **and** recorded in Core's per-user Notification Center. The history is an operator convenience surface, not an audit log or replacement for module-owned alert/event persistence. Email/SMS/WhatsApp delivery remains the responsibility of the outbound Notifications module or another integration.

## Runtime access

Authenticated modules receive a module-scoped `notifications` object in `register(context)`:

```js
export async function register({ notifications }) {
  notifications.success('Report is ready.', {
    title: 'Monthly report',
  })
}
```

Public/anonymous module entrypoints do not receive this authenticated notification service.

## Convenience methods

```js
notifications.info(message, options?)
notifications.success(message, options?)
notifications.warning(message, options?)
notifications.error(message, options?)
```

Example:

```js
notifications.warning('Three endpoints have not checked in for more than 24 hours.', {
  title: 'Endpoint health',
  dedupeKey: 'stale-endpoints',
})
```

## Generic method

```js
notifications.show({
  level: 'info' | 'success' | 'warning' | 'error',
  title: 'Optional title',
  message: 'Required plain-text message',
  duration: 6000,
  sticky: false,
  dedupeKey: 'optional-module-local-key',
  action: {
    label: 'View report',
    handler: async () => { /* optional live callback */ },
    route: '/module/example/object/42', // optional durable internal route
    closeOnClick: true,
  },
  metadata: {},
})
```

`show()` returns the generated toast ID.

## Dismissal

```js
const id = notifications.info('Working…', { sticky: true })
notifications.dismiss(id)
```

A module may clear only its own currently visible notifications:

```js
notifications.clear()
```

Core also clears notifications contributed during a module registration attempt if that module fails to load.

## Duration rules

Default display times are:

| Level | Default |
| --- | ---: |
| `info` | 6 seconds |
| `success` | 6 seconds |
| `warning` | 9 seconds |
| `error` | 10 seconds |

A module may set `duration` from `0` through `60000` milliseconds. `0` means no automatic dismissal. `sticky: true` is equivalent to `duration: 0`.

Core displays at most five toasts at once so a noisy module cannot cover the application shell.

## Deduplication

Use `dedupeKey` for repeat status/alert messages that describe the same condition:

```js
notifications.warning('Backup destination is unavailable.', {
  title: 'Backup warning',
  dedupeKey: 'backup-destination-unavailable',
})
```

The key is scoped to the calling module. Sending another notification with the same key updates the visible toast and resets its timer instead of creating another popup.

Do not generate a new random dedupe key on every poll. Use a stable key for the condition being reported.

## Actions

A toast may expose one module-owned action:

```js
notifications.success('Quarterly report is ready.', {
  title: 'Report complete',
  action: {
    label: 'View report',
    handler: async () => {
      await router.push('/reports/quarterly/42')
    },
  },
})
```

A live `handler` executes in the module's browser runtime. An internal `route` may also be supplied so the action remains usable later from Notification Center history. Routes must begin with `/` and may not be external or protocol-relative URLs. If no live handler is supplied, Core navigates to the route directly.

Core persists only the action label and safe internal route. JavaScript handlers and runtime `metadata` are never persisted. The action should normally reuse an existing module workflow. Do not place privileged logic in the toast callback; backend authorization remains authoritative.

## Limits and safety

Core enforces:

- plain text only; notification content is not rendered as HTML;
- title maximum: 120 characters;
- message maximum: 1000 characters;
- action label maximum: 60 characters;
- dedupe key maximum: 120 characters;
- duration maximum: 60 seconds unless sticky;
- maximum five visible toasts;
- persistent history capped to the latest 500 notices per user and 30 days;
- only plain-text notice content and optional internal route actions are stored; runtime metadata is not persisted.

Modules must not use notifications to expose secrets, API tokens, passwords, recovery keys, or other sensitive values.

## Recommended usage

Use a toast when the operator benefits from knowing that something happened without leaving the current page. Good examples are **report ready**, **scan completed**, **save succeeded**, **background job failed**, and a concise actionable warning.

Do not toast every polling cycle, every successful API request, every device telemetry update, or large batches of repeated events. Prefer `dedupeKey`, dashboard badges, module tables, or a durable alert/inbox surface for high-volume data.

## Background jobs

A module may poll or otherwise observe its own backend job and emit one notification when the job reaches a meaningful terminal or warning state:

```js
if (job.status === 'succeeded') {
  notifications.success('The report is ready.', {
    title: 'Report complete',
    dedupeKey: `report:${job.id}`,
    action: {
      label: 'Open report',
      handler: () => openReport(job.id),
    },
  })
}
```

Core's toast service does not itself poll module APIs or discover backend events. The module remains responsible for knowing when its own event has occurred.

## Module agent rule

**Do not ship a module-specific toast framework. Use the Core `notifications` runtime contract for authenticated in-app notices.**
