# UI 0.12.104

Date: 14 October 2026. Requires Core 1.17.33 or later (raised from 1.17.32, the Core release this UI was built and tested against).

## What changes for you

- **A real terminal is available to modules.** Tactical's terminal uses xterm.js, an open-source terminal emulator under the MIT licence. Tec-Tac now has the same emulator in a shared widget. A module can draw its terminal with it, and you get colours, cursor keys, full-screen programs such as editors, and a scrollback of up to 50000 lines.
- **Copy and paste work the way you expect.** Ctrl+Insert copies what you have selected. Shift+Insert and Ctrl+V paste once. Ctrl+C still stops the running command on the remote machine.
- **Nothing changes until a module uses it.** No screen in Tec-Tac changes look in this release. Remote Background keeps its own small terminal for now. It adopts the shared widget in a later release.

## What stays as it was

- Tactical's terminal socket, the job follow service, the sign-in screen and the notifications work as before.
- Every module installed today keeps working without a change.

## What you do not get yet

- **Remote Background's terminal** still uses its own small screen. It moves onto the shared widget in a later Remote Background release, after Johan has tested it against Tactical's terminal.
- **The browser contract export** does not list the terminal row yet. Core writes that row (`reviews/requests/core.md`). Until it does, a module that depends on it says so in its own release notes.

## For module developers

- **`context.terminal.create(host, options)`** draws a terminal in the module's window and resolves with a handle. It is bound to your module id. `registerPublic` gets no terminal.
- The handle has `write`, `writeln`, `clear`, `reset`, `focus`, `blur`, `fit`, `size`, `getText`, `getSelection`, `hasSelection`, `copy`, `paste`, `setTheme`, `setOptions`, `onInput`, `onResize` and `dispose`.
- Limits: 8 live terminals per module; scrollback up to 50000 lines; resize from 1 to 1000 rows and columns.
- Colour values and the font family are checked before they reach the terminal. Remote output is drawn as text only. Links in the output do nothing when clicked.
- xterm.js loads on the first `create()`, so a module that never opens a terminal does not load it.
- **Licence:** `@xterm/xterm` 5.5.0 and `@xterm/addon-fit` 0.10.0, both MIT. The licence text ships in the build at `/tec-tac/licenses/xterm-LICENSE.txt`, and the package list is in `THIRD-PARTY-NOTICES.md`.
- The full contract is in `docs/module-terminal.md`. The browser contract row `ui.authenticated.terminal` is in `docs/module-runtime-api.md`.
- All of this is additive. No field or method is removed.
