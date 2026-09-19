# Tec-Tac UI 0.10.7

0.10.7 makes browser cache invalidation part of the Tec-Tac lifecycle.

- `index.html` and `/tec-tac/modules/modules.json` are served with `Cache-Control: no-store` plus compatibility no-cache headers.
- successful module install/update/remove/enable/disable/visibility jobs automatically reload Tec-Tac after runtime synchronization completes.
- successful Framework and UI System Update jobs automatically reload Tec-Tac so the browser re-reads runtime context and current shell assets.
- content-hashed dynamic module entry URLs from 0.10.6 remain in place, so module JavaScript can still be cached safely by URL version.

The goal is deterministic post-install freshness without disabling useful caching for immutable Vite assets.
