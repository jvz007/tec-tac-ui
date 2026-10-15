# UI 0.12.110

Date: 14 October 2026. Requires Core 1.17.39 or later, the same Core release as 0.12.109. No Core change is needed.

## What changes for you

- **The sign-in screen tells you why you were signed out.** When Tec-Tac signs you out, for example after a long idle time or when your network address changes, a short plain line now sits above the username and password fields. It gives the reason in the same words Tec-Tac already used. A wrong password still shows its own red message underneath the fields. The line goes as soon as you press Continue. A first visit, or a sign-out you chose yourself, shows no line.
- **You can show or hide your password.** The password field on the sign-in screen and the "Re-enter current password" field in two-factor setup each have a Show button. Pressing it shows the password as text, and Hide hides it again. The password is hidden every time the sign-in screen moves to its next step, so a visible password never carries over. The authenticator code and backup code fields do not change.
- **A failed provider sign-in says so.** If your single sign-on provider (for example Microsoft or Google, through Tactical) sends you back with an error, the screen now says "There was an error logging into your provider" and offers Back to sign in. Tec-Tac does not try to finish that sign-in. Before this release the error was dropped on the way back, so the screen tried to finish the sign-in and showed a generic failure with a Retry button.

## For server administrators: run one command after updating

- The fix for the provider error needs the nginx redirect on your server to pass the query string on. Run this once after the update on each Tec-Tac server:

  `sudo bash scripts/repair-nginx.sh`

  Until you run it, a provider error still shows the generic "could not be completed" message. Nothing else breaks. A server that is not run again keeps the old redirect, which drops the query string.
- Running the script again is safe. It keeps a backup of the nginx site file, as it always does.

## Closed from an earlier review

- The held Low finding "Callback redirect drops allauth error query string", from the review of UI 0.12.72-1, is closed by this release. The redirect now keeps the query string, and the callback screen reads it.

## For module developers and testers

- Nothing changes for modules. The sign-in registry (`tecTacSsoProviders`) and the module runtime are unchanged.
- The UI test script now finds a Python that really runs. On Windows, `python3` is often a Store alias that exits with an error, so the tests skipped past it and failed on the first line. The tests now try `PYTHON_BIN`, then `python`, then `python3`, then `py -3`, and stop with one line that names what they tried. The server's install and repair scripts still use `python3`, because that is correct on Linux.

## Tests added or changed

- New: `signin-parity-0.12.110.mjs` covers the session line, the Show and Hide control, the provider-error return (including that the token exchange is not called), the path check in the startup code and the nginx redirect.
- New: `python-bin-0.12.110.sh` covers the Python choice and its failure line.
- Changed: the three SSO tests from 0.12.72, 0.12.76 and 0.12.77 now check the new redirect line.
- Changed: `core-requirement-0.12.109.mjs` no longer pins the UI version number. It checks that the version files agree and that the 0.12.109 notes are in the archive.

## Housekeeping

- The 0.12.109 release notes moved to `docs/releases/`, as every earlier release does. This note is the one at the root.
- Not changed in this release: the sign-in introduction text, the "Open Tactical instead" button, the toast sender and the loading bar.
