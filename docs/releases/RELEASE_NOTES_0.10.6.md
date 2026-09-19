# Tec-Tac UI 0.10.6

Dynamic module runtime ownership and cache-coherency hardening.

- Declares `/tec-tac/modules/modules.json` as the canonical runtime module-manifest URL, backed by `/var/lib/tec-tac/ui/tec-tac/modules/modules.json`.
- `sync-modules.sh` now appends a content-derived cache key to authenticated/public module entry URLs, so replacing module code in-place cannot leave the browser executing an older ES module from the same stable URL.
- Authenticated dynamic modules receive a guarded router facade. A module cannot silently claim a core route or a route name/path already claimed by another dynamic module.
- Dynamic-route ownership conflicts surface through the existing module-load diagnostics instead of silently rendering the wrong component.
- Core UI contains no built-in Automation route; Automation remains dynamically owned by the installed `automation` module.
