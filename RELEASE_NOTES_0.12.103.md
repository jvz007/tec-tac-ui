# UI 0.12.103

Date: 14 October 2026. Requires Core 1.17.32 or later (raised from 1.17.31, the Core release this UI was built and tested against).

## What changes for you

- **No toast on the sign-in screen.** When your session ends (idle timeout, revoked, expired), the sign-in screen now shows only the sign-in message. A module can no longer pop a warning on top of it. The toast you saw, "couldn't check your roles because you're not logged in", most likely came from a module that was still loading when the session ended (Software 0.4.0, found by reading its code, not reproduced).
- **Your first sign-in message stays.** Before, a second failed call from a module could overwrite "Your Tec-Tac session expired due to inactivity. Sign in again." Now the first message stays.
- **Background job follow is in place.** A module can ask the shell to watch a job and tell you when it finishes, even after you leave its page. Nothing you see changes until a module uses it.

## What stays as it was

- A context refresh and a backend outage still show notices. Only the signed-out state is quiet.
- The toast stack, the notification history and the bell work as before once you are signed in.
- Public pages that need no sign-in are not affected.

## What you do not get yet

- **Software still builds its own warning on a 401** until a signed Software release stays silent. The shell now hides it. The change is requested in `reviews/requests/core-modules.md`.
- **Software's Install, Uninstall and Refresh follow** moves onto the job service in a later Software release.
- **Universal filters** and **Save all UI preferences** still wait for Core.
- **The production gate for uncategorised modules** is not built.

## For module developers

- **A 401 means signed out. Do not toast it.** While signed out, the shell refuses `api`, `apiRaw`, `apiBlob` and `apiText` itself, with an error of status `401` and code `signed_out`, and sends no request.
- **Notifications return `null` while signed out.** `show`, `info`, `success`, `warning` and `error` make no toast and store no notice.
- **`loadUiModules` stops when the session ends.** Modules not yet loaded are skipped with reason `signed-out`.
- **`context.jobs.follow(descriptor)`** returns `{ id, cancel() }`. See `docs/module-job-follow.md`. Limits: 10 follows per module and 50 in all; the time limit is at most 30 minutes.
- All of this is additive. No field or method is removed.

## Checks

`tests/signed-out-no-toast-0.12.103.mjs` and `tests/job-follow-0.12.103.mjs` are new.
