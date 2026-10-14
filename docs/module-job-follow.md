# Background job follow (`jobs`)

UI 0.12.103. A module hands the shell a read route and a rule for "finished". The shell polls the route itself, so the follow keeps running after the person leaves the module's page. When the job finishes, the person gets a notice through the module's own notifications: a toast, and an entry in the bell.

The service only reads. The backend decides everything (AD-12).

## Use

```js
const follow = context.jobs.follow({
  id: 'install-7',                       // module-local key; a second follow with the same id replaces the first
  title: 'Install 7-Zip',
  path: '/api/tfd/software/jobs/7/',     // a GET read route, called through this module's own guarded api
  check: (payload) => (payload.status === 'done' ? 'success' : payload.status === 'failed' ? 'error' : false),
  successMessage: 'Install 7-Zip finished.',            // text, or (payload) => text
  errorMessage: (payload) => `Install failed: ${payload.reason}`,
  timeoutMessage: 'Install 7-Zip has not finished. Open Software to check.',
  intervalMs: 5000,                      // default 5000, clamped to 2000 to 60000
  timeLimitMs: 600000,                   // required, clamped to 10000 to 1800000 (30 minutes)
})
follow.cancel()
```

`follow()` returns `{ id, cancel() }`. `check(payload)` returns `'success'`, `'error'`, or a false value while the job is still running.

## When a follow stops

- At the first finish: one success or error notice.
- At the time limit: one timeout notice.
- On `cancel()`: silent.
- When the module is unloaded or abandoned: silent.
- When the session ends: silent. Nothing is read after that.
- On `pagehide`: silent.
- A read that fails with status 401 stops the follow silently.
- Three failed reads in a row (any other status, or a `check` that throws) stop it with one error notice.

Notices use `dedupeKey` `job-follow:<id>`.

## Limits and refusals

- 10 live follows per module and 50 in all. A further follow throws a plain error.
- A follow is refused outside a context Core supplied (the same rule as `services`), while signed out, and for an abandoned or unloaded module.
- The module's id is bound by the shell. An argument cannot name another module.
- The read goes through the module's guarded `api`, so the rule that keeps a module off another module's `tactical-operations` routes still applies.

## Contract row

`ui.authenticated.jobs`. Core's export row is requested in `reviews/requests/core.md`.
