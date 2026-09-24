# Tec-Tac UI 0.12.15

## Notification Center

- Added a top-bar notification-history control with unread count.
- Added a right-side Notification Center drawer with All/Unread filters, mark-all-read, clear-read, timestamps, source provenance, and durable route actions.
- Existing transient toast behavior remains intact; dismissing a toast does not remove its history record.
- History is loaded only when the drawer is opened; shell startup receives only the unread count.
- Module notification actions may now declare an internal `action.route` so an action can survive in persistent history. Existing live `action.handler` callbacks remain supported.
- Runtime notification metadata is never copied into persistent history.

## Performance optimisation pass

- Reused the module manifest already fetched during public-module bootstrap instead of downloading it again during authenticated context startup.
- Switched repeated permission membership checks during shell/module registration to Set-backed lookups.
- Notification history is lazy-loaded and bounded instead of becoming part of the normal authenticated bootstrap payload.
- Security-sensitive session validation, RBAC enforcement, module route ownership, and update trust checks remain unchanged.
