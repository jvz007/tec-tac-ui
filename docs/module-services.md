# Module services (browser contract between modules)

A module can publish a named browser operation for other modules to call. Use this for a job one module owns and another
module needs to start: run a script, open a check editor, pick an alert template. A service is the browser side of a
[public contract](module-runtime-api.md): the module that owns the operation provides it, and every other module calls it
through the same name.

Services arrived in UI 0.12.101. A module built before that release still loads and works. The `services` object is
simply there in `register(context)`.

## Provide

The provider module publishes a service in `register(context)`:

```js
export default {
  async register({ services }) {
    const remove = services.provide('scriptexecution.run-script', async (args, { caller }) => {
      return runScript(args.scriptId, args.agentId)
    }, {
      label: 'Run script',
      permission: 'scriptexecution.run',
      tacticalPermission: 'can_run_scripts',
    })
  },
}
```

- The name must begin with the provider's own module id and a dot: `scriptexecution.run-script`. Letters, digits, `.`,
  `_` and `-` are allowed, up to 120 characters.
- Another module cannot take a name that is already provided. Calling `provide` again with the same name from the same
  module replaces that service.
- `provide` returns a remover. Calling it removes that service only.
- The handler receives `(args, { caller })`. `caller` is the id of the module that called. The loader binds it: no value in
  `args` can change it. `caller` is a hint for the provider. It is never authorization: the backend decides every server
  action.

## Permissions

A service is visible and callable only for a person who passes its checks:

- The provider module's own permissions (from its descriptor) always apply.
- `permission` or `permissions` add more permissions. They can narrow a service, never widen it.
- `tacticalPermission` (one flag or a list) must be strictly `true` for each flag, as in `hasTacticalPermission`.

A service the person may not use is hidden (AD-12). It does not appear in `list()`, `has()` returns `false`, and `call()`
refuses it.

**A service needs at least one permission (UI 0.12.102).** `provide` refuses a service whose permissions are all empty: the
provider's module permissions, the service's `permission` or `permissions`, and `tacticalPermission` together must name at
least one. A refused `provide` throws `Service <name> needs at least one permission: declare one for the module or for this
service.` Nothing is registered. A service with no permission would be open to every module and person.

**Outside a backend-supplied context every service is hidden and refused (UI 0.12.102).** Before sign-in, or when the
context is not from Core, `has()` returns `false`, `list()` is empty and `call()` refuses with `service_denied`. This is the
same rule as the header registry and `addNavigation`.

## Call

```js
export default {
  async register({ services }) {
    if (services.has('scriptexecution.run-script')) {
      await services.call('scriptexecution.run-script', { scriptId: 7, agentId: 'abc' })
    }
  },
}
```

- `services.has(name)` is `true` only when the provider is loaded and this person passes the checks above.
- `services.call(name, args)` checks the permissions again at call time, then awaits the handler and returns its result.
- `services.list()` returns the services this person can see, as `{ name, label, provider }`.

Errors have a `code` when the shell refuses before the handler runs:

| Code | Meaning |
| --- | --- |
| `service_unavailable` | No service with that name is provided (the provider is not loaded, or it was removed). |
| `service_denied` | The service exists but this person may not use it. |

An error thrown inside the provider's handler reaches the caller with the message
`Service <name> from <provider> failed: <message>`. The error has `service`, `provider` and `cause` set.

## Lifetime

Everything a module provides is removed when its `register()` fails, times out, or is abandoned after a time-out. An
abandoned module cannot provide or call a service any more; a call made after abandonment throws. Calls from one module
to another stay available only while the provider is loaded. A module that is switched off while the page is open is
unloaded at once (UI 0.12.102): its services stop answering, and `has()` and `call()` refuse them, before the page reloads.

## What this does not replace

Context actions (`contextActions`) remain for actions a person picks from a resource menu. Services are for calls between
modules. A service does not add a menu item. A module that needs a menu item should still register a context action.

## Rules

- Keep a service small: a named operation with a plain argument object and a plain result.
- Never pass a token, a password or a key through `args`. Use the module's own `api` helpers on the provider side.
- Do not call another module's internal functions. Call only the services it publishes.
- The provider decides how much to check in its handler. Core and Tactical still decide every server action.
