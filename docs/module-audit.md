# Module audit runtime

Tec-Tac Core owns the audit write path. Authenticated modules receive a module-scoped `audit` service through `register(context)` and must not write Tactical `AuditLog` directly.

```js
export async function register({ audit }) {
  const result = await audit.record({
    action: 'modify',
    object_type: 'patch_profile',
    object_id: '123',
    message: 'Updated patch profile Monthly Servers',
    before: oldValue,
    after: newValue,
    metadata: { source_view: 'profiles' },
  })
}
```

Core adds the authenticated actor, module ID, installed module version, `source = tec-tac`, and request/correlation provenance where available. Modules cannot supply or override those values.

## Standard actions

Prefer: `add`, `modify`, `delete`, `run`, `approve`, `deny`, `enable`, `disable`, `install`, `uninstall`, `view`, `export`, `import`, `sync`, `test`, `acknowledge`, `resolve`.

When none fits, use the controlled `custom:<slug>` fallback.

## Failure semantics

`audit.record()` is non-fatal by default. If the Core audit API is unavailable or rejects the request, the browser helper logs a Core audit error to the console and resolves with `{ recorded: false, ... }` rather than breaking an already-successful UI action.

Server-mutating actions should normally record audit data from the authorized backend endpoint using `tec_tac.audit.record(...)`, so the business action and audit event share the authoritative server context.

## Security boundary

The browser event must not contain `username`, `actor`, `user`, `module_id`, `module_version`, `source`, `request_id`, or `correlation_id`. Those fields are Core-owned.

Backend authorization for the business action remains authoritative. An audit event never grants permission to perform an action.
