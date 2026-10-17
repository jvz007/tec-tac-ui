# Sign-in landing

A module can ask the shell to send a person somewhere after sign-in. The typical use is a first-run page: an administrator who signs in for the first time lands on the setup page, not the dashboards. The module decides whether its page is still needed. The shell only asks, and only at the one moment it is allowed to.

The landing hook arrived in UI 0.12.112. A module built before that release still loads and works, and it keeps its own page as the fallback until it adopts the hook.

**Contract row (UI 0.12.112, listed in the public contract export from 1.17.50-0.12.115).** Browser contract row `ui.authenticated.signInLanding` (phase `authenticated`, service `signInLanding`): `register({ id, permission, check })`; a check returns nothing, a route path, or `{ dialog: '<module id>.<dialog id>' }`; the rules below. Core lists it in the public contract export from 1.17.50-0.12.115.

## Register

```js
export default {
  register(context) {
    context.signInLanding.register({
      id: 'setup',
      permission: 'welcome.view',
      async check({ reason, signal, context: person }) {
        const state = await readSetupState(signal)
        if (state.status === 'complete') return undefined   // carry on to the dashboards
        return { dialog: 'welcome.wizard' }                 // or return '/administration/welcome'
      },
    })
  },
}
```

- `id` (required): a module-local name, letters, digits, `_` and `-`, at most 64 characters. It is used in the shell's log lines.
- `permission` (optional): a permission code. When it is given, the check is called only for a person who has that permission. The module's own load rules still apply first: a module the person may not use is never loaded, so its check is never called.
- `check({ reason, signal, context })` (required): `reason` is `'landing'`. `signal` is an `AbortSignal` that aborts when the person signs out or the session ends. `context` is the person's shell context, the same object `register(context)` gets as `context.context`.
- One registration per module. A second `register` replaces the first.

## What the check may return

| Return | What the shell does |
|---|---|
| nothing, `undefined`, `null` or `false` | Carries on to the next check, and then to the dashboards |
| a route path, such as `'/administration/welcome'` | Moves the person there, with the rules below |
| `{ dialog: 'welcome.wizard' }` | Opens the dialog your module registered with `context.dialogs.register` (see `module-dialogs.md`) |
| anything else, such as `true` or a number | Ignored, one warning in the console, and the next check runs |

## The rules the shell enforces

1. **Only people who may use the module.** A check runs only when the module loaded for this person, and, when `permission` is given, only when the person has it. Your module decides for itself whether to skip a person who said so, for example through `context.modulePreferences`, and it returns nothing when its setup is complete.
2. **Only on the default landing.** The check runs only when the page was opened on `/` or `/dashboards`, or with no address at all. It never runs in a popup window, on a public page, on the sign-in return page (`/sso/callback`), while the person is signed out, outside a signed-in backend context, or when the page was opened on a deep link (for example a bookmarked module page, or a reload of any other page). Those are never redirected.
3. **Never blocks sign-out.** The check gets an `AbortSignal`. Signing out aborts it, and the shell stops waiting for the check at once.
4. **Unsaved changes still win.** A route move goes through the shell's `requestLeave` guard and then `router.replace`. If the page has unsaved changes, the landing is dropped and not retried, so the person stays where they are. A dialog result is dropped the same way, so the dialog never opens over a page with unsaved changes.
5. **A failure is ignored, with one warning.** A check that throws, rejects, returns a value the shell cannot use, or does not answer within `context.module_register_timeout_seconds` (5 to 300 seconds, 30 by default) is ignored. The warning names your module. The next check still runs. A late answer after the time limit is ignored. The page never goes blank.
6. **A route result must be safe.** A route is accepted only when all of these hold:
   - it is one path that starts with a single `/` and has no scheme, `//`, `..`, backslash, `#`, `:`, whitespace or control character;
   - it is not under `/popup/`, `/public/` or `/sso/`;
   - it resolves to a real page, not the catch-all and not a redirect;
   - that page belongs to the same module (its route's `meta.dynamicModule` is your module id), or it is one of Core's own named pages.
   
   Anything else is ignored with a warning. A module cannot send the person to another module's page.
7. **A dialog result must be your own.** The id must start with your module id and a dot, and the dialog must be one your module registered. Anything else is ignored with a warning.
8. **One landing per sign-in, no loop.** The run is one-shot per page load: the checks run once, in module load order. The first check that returns something acts, and the others do not run. The move uses `router.replace`, so Back does not return to the address that redirected. A person who leaves the landing page inside the same page is not sent back. A reload on the dashboards runs the checks again, which is why a check must return nothing once its setup is complete.
9. **Disabled, failed or unloaded modules are never called.** When a module is switched off, fails or is uninstalled while the page is open, its check is removed.
10. **Public pages get nothing.** `registerPublic(context)` gets no `signInLanding`.

## Open questions for Johan (UI Q66 and Q67)

- **UI Q66, the reload rule.** The shell runs the checks once per page load, kept in memory. Sign-in ends in a full page reload, so a person who leaves the landing page is not sent back until the next sign-in only if the shell also remembers the landing in browser session storage. The release does not do that. The built behaviour is: a reload on `/dashboards` runs the checks again, and the module's own setup-complete state is the brake. The alternative is a small session flag, cleared at sign-out. Recorded in `reviews/questions/ui.md` as UI Q66.
- **UI Q67, where a route may point.** The release accepts only the module's own pages and Core's named pages. The alternative is any page. Recorded in `reviews/questions/ui.md` as UI Q67.

## Notes for the module developer

- Keep the check quick. It runs before the dashboards appear, and a slow answer is cut off at the time limit.
- Do not change your module's own state from inside the check. Read it, decide, return.
- Use `signal` for any network request the check starts, so a sign-out stops it.
- Adopt the hook when you next release. Until then, keep your own page as the way in.

## Backwards compatibility

No module in `modules/` uses `context.signInLanding` when this was written, so the change is an addition. Core's `/` still redirects to `/dashboards` exactly as before when no module registers a check.
