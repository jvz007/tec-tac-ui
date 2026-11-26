# UI 0.13.8

Date: 26 November 2026. Requires Core 1.18.57 or later (was 1.18.53).

## What changes for you

The Engineer Console can now sign you in and enrol your PC through the browser. You stay in control: each step asks one plain Yes or No.

- **Engineer Console sign-in** (`#/console/sign-in`). The Console opens this page. If your PC's certificate is one of yours and still active, Tec-Tac asks: "Sign in the Engineer Console on <PC> as <you> to <host>?" On Yes, Core makes a one-time code and the browser hands it to the Console on your own PC (127.0.0.1). On No, nothing is sent.
- **Engineer Console enrol** (`#/console/enrol`). Same idea for a new PC. It needs an open enrolment, which an administrator gives you in Access > Console certificates. Without one, the page says so and sends nothing. The My Account card still works as before.
- **Signing in first.** If you are not signed in, you sign in as usual and land on the same page. Password and authenticator-code sign-in keep the page already. Single sign-on (SSO) now does too: Tec-Tac keeps the Console's link values for up to 5 minutes (no token, no code), then opens the page. If your browser blocks that storage, you land on the dashboards. Press Sign in in the Console again.
- **Access > Login sessions.** A session opened by an Engineer Console now shows "Engineer Console (<PC>)" and the short serial (the first 8 characters of the certificate's serial). Older Core shows nothing new.
- **Console certificates.** The page and the help article now say how to find every row of one certificate in the Audit page: search its serial (the long number that identifies the certificate) or the actions `custom:console-cert-issued`, `custom:console-cert-revoked` and `custom:console-cert-refused`.

Both new pages refuse a bad link and show only Close. The one-time code lives only in the click handler. It is never kept in the page, the address bar or browser storage.

## For module developers

No registry, runtime helper or `api()` change. No module uses these pages. `requestEnrolmentCode` gains an optional `body`; calls without one behave as before.

## Assumptions

- The enrol page reads `port`, `state` and `challenge` (the PKCE `code_challenge`) from the address, like sign-in without `serial`. The Console must open exactly that. Filed for the networkprobe module.
- `state` and `challenge` must be 43 base64url characters, the port a plain whole number from 1024 to 65535, the serial 32 lower-case hex characters. Anything else is refused.
- The Console's answer is read at `http://127.0.0.1:<port>/callback?code=<code>&state=<state>`. Scheme, host and path are fixed. Nothing else from the address is used.
- The Core requirement is 1.18.57 because the enrol page needs the `code_challenge` key. Sign-in alone works with 1.18.56.
- Until Core 1.18.58 gives the Console the web address, open the page by hand on the frontend host (see the checklist).

## Checks

`npm test` and `npm run build` results are in the release report. New tests: `tests/console-sign-in-0.13.8.mjs`, `tests/console-sign-in-route-0.13.8.mjs`, `tests/console-enrol-0.13.8.mjs`, `tests/console-sessions-label-0.13.8.mjs`, `tests/console-certificates-hint-0.13.8.mjs`. The release test is `tests/release-0.13.8.mjs`. The 0.13.7 notes moved to `docs/releases/`.

## Dev-server checklist

Open the page by hand: `https://<frontend host>/tec-tac/#/console/sign-in?port=40123&state=<43 chars>&challenge=<43 chars>&serial=<32 hex>`. The stand-in client `examples/console-session-client.py` from Core 1.18.56 and 1.18.57 can listen on 127.0.0.1 and make the challenge with its `pkce` command.

1. Signed out, open the sign-in link, sign in with password and authenticator code. PASS: you land on "Engineer Console sign-in". FAIL: you land on the dashboards. Send back: the link shape (values hidden) and what you saw.
2. Same with single sign-on. PASS: after the provider you land on the same page. FAIL: dashboards. Send back: whether the browser blocks site data.
3. Signed in as a different user than the certificate's owner. PASS: "not one of yours, or it has ended", only Close. FAIL: a Yes button shows.
4. Port `80`, or a state shorter than 43 characters. PASS: "This sign-in link is not valid", only Close. FAIL: any other screen.
5. Your own active certificate, answer No. PASS: "Nothing was sent." and the Console receives nothing. FAIL: the Console gets a code.
6. Same, answer Yes. PASS: the browser opens `http://127.0.0.1:<port>/callback?code=...&state=...` and the stand-in client prints it. Then "You can close this tab..." FAIL: any error. Send back: the message shown.
7. Open the enrol link with no open enrolment. PASS: "An administrator must allow you to enrol first...", only Close. FAIL: a Yes button.
8. Ask an administrator to allow you, open the enrol link, answer Yes. PASS: the callback receives a code. FAIL: 400 or any error. Send back: the message.
9. Access > Login sessions after step 6. PASS: your session shows "Engineer Console (<PC>)" and the short serial. FAIL: no label.
10. Console certificates page and the help article "Console certificates". PASS: both name the three audit actions and the serial. FAIL: text missing.
