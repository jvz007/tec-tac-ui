# Terminal widget (`terminal`)

A module can draw a real terminal in its own window through `register(context).terminal`. The widget is xterm.js (MIT
licence), the same emulator Tactical's own terminal uses. It handles colours, cursor keys, full-screen programs such as
editors, the scrollback and a window that changes size. The module supplies the text it wants drawn and receives what the
person types.

Added in UI 0.12.104. The widget needs no Core API. It pairs with the Tactical terminal socket (`tacticalWebSocket`, UI
0.12.102, see [module-tactical-websocket.md](module-tactical-websocket.md)). The Core contract row is `ui.authenticated.terminal`;
see [the runtime API](module-runtime-api.md#terminal-widget-terminal).

## Open a terminal

```js
const terminal = await context.terminal.create(host, {
  theme: { background: '#1d1f21', foreground: '#c5c8c6', cursor: '#c5c8c6' },
  fontSize: 14,
  scrollback: 50000,
  onInput: (data) => session.input(data),
  onResize: ({ rows, cols }) => session.resize(rows, cols),
})

session.on('output', ({ output }) => terminal.write(output))
```

- `host` is an element you own. The terminal fills it and keeps it fitted as the window changes.
- `create()` resolves with a handle. It rejects with a plain message when it cannot open.
- The first `onResize` call comes once the terminal is open, with the size that fits. Send that size to the session at once.
- Keyboard focus goes to the terminal as soon as it opens, unless you pass `focus: false`.

## Create options

| Option | Values | Default |
| --- | --- | --- |
| `theme` | an object of colour names (see below); each value must be a colour string | the shell's colours |
| `fontFamily` | text up to 300 characters, no control characters, none of `; { } < >` and no `url(` | the shell's monospace stack |
| `fontSize` | whole number 8 to 32 | 14 |
| `cursorBlink` | `true` or `false` | true |
| `scrollback` | whole number 0 to 50000; a larger value is clamped | 50000 |
| `convertEol` | `true` or `false`; turns a plain line feed into a line break | true |
| `focus` | `true` or `false`; takes keyboard focus on open | true |
| `rows` | whole number 1 to 1000; the size until the first fit | 24 |
| `cols` | whole number 1 to 1000; the size until the first fit | 80 |
| `ariaLabel` | text, up to 200 characters; control characters are removed | none |
| `onInput(data)` | a function; called with each piece of typed input | none |
| `onResize({ rows, cols })` | a function; called with the size once on open, then on each change | none |

A value of the wrong type is replaced by the default. A number outside its range is clamped to the nearest limit.

### Theme

The theme takes these names: `background`, `foreground`, `cursor`, `cursorAccent`, `selectionBackground`, `black`, `red`,
`green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `brightBlack`, `brightRed`, `brightGreen`, `brightYellow`,
`brightBlue`, `brightMagenta`, `brightCyan` and `brightWhite`.

Each value must be a `#` colour of 3, 4, 6 or 8 digits, or an `rgb()`, `rgba()`, `hsl()` or `hsla()` colour. Any other value is
dropped and never reaches the page. A name you leave out takes the shell's colour (`--bg` for background, `--ink` for
foreground, `--accent` for the cursor).

## The handle

| Member | What it does |
| --- | --- |
| `write(text)` | draws text. Text only: any other value throws a plain error. The text is drawn as text, never as HTML. |
| `writeln(text)` | draws text and a line break. Text only. |
| `clear()` | clears the screen, keeping the line you are on. |
| `reset()` | resets the terminal to its start state. |
| `focus()` | moves keyboard focus to the terminal. |
| `blur()` | takes keyboard focus away. |
| `fit()` | fits the terminal to its window now and returns `{ rows, cols }`. |
| `size()` | returns `{ rows, cols }` as they are now. |
| `getText()` | returns the whole buffer, from the first scrollback line to the last. Wrapped lines are joined, trailing spaces are trimmed and trailing empty lines are dropped. Use it for a Copy button. |
| `getSelection()` | returns the selected text. |
| `hasSelection()` | returns `true` when text is selected. |
| `copy({ selectionOnly })` | copies the selection (when `selectionOnly` is `true`) or the whole buffer to the clipboard. Resolves with the text copied. Rejects with the clipboard helper's plain message when the copy fails. |
| `paste(text)` | pastes text as the terminal itself would, so bracketed paste works. Text only. |
| `setTheme(theme)` | changes the colours. The same rules as the `theme` option apply. |
| `setOptions({ fontSize, fontFamily, cursorBlink })` | changes those three settings, with the same limits. A font change fits the terminal again. |
| `onInput(fn)` | adds a listener for typed input. Returns a function that removes it. |
| `onResize(fn)` | adds a listener for size changes. Returns a function that removes it. |
| `dispose()` | closes the terminal. It removes its listeners and its resize watch and empties the host. Calling it twice does nothing. |

The module scope has two members: `create(host, options)` and `clear()`. Only the shell calls `clear()`, when the module is
unloaded or its start-up fails.

## Size and fit

- The terminal watches its host. When the host changes size, the fit runs after a short pause (about 50 ms), so a drag does
  not fit on every pixel.
- A host with zero width or height (a hidden tab) is not fitted. The terminal keeps its last size, and a fit runs when the
  host shows again.
- `onResize` fires once after open, then only when the rows or the columns change. Its numbers are whole numbers from 1 to
  1000, so you can pass them straight to `session.resize(rows, cols)`. It never reports 0.

## Keys

- Typed input goes to `onInput` unchanged. That covers the arrow keys, Ctrl combinations, Ctrl+Left and Ctrl+Right, the
  history keys Up and Down, and the keys a full-screen program uses in the alternate screen.
- Ctrl+C always reaches the shell as the interrupt, even with text selected.
- Ctrl+Insert copies the selection. It is not sent to the shell.
- Shift+Insert and Ctrl+V paste through the browser's own paste event, once. The widget does not paste a second time.

Put these keys in the module's keyboard tooltip: Ctrl+Insert copies, Shift+Insert pastes.

## Copy and paste

- The copy goes through the shell's clipboard helper. Where the browser gives no clipboard, `copy()` rejects with the plain
  message "Clipboard access is unavailable in this browser." A failed copy rejects with "Could not copy to the clipboard."
- A Copy button uses `getText()` and `copy()`. Show your own notice when it resolves or rejects.

## Safety

Remote output is untrusted, so the widget keeps these rules:

- Output is drawn as terminal text only. Nothing from the remote end becomes HTML.
- A link the remote end marks (an OSC 8 hyperlink) is shown as text. Clicking it does nothing. The widget never opens a window
  and never asks with `confirm()`.
- The widget has no clipboard addon and no web-links addon. The remote end cannot write to the clipboard or read it.
- The widget does not act on window title changes or window-size requests from the remote end.
- Colour values and the font family are checked before they reach the terminal (see the tables above).

## Limits

- Scrollback: 50000 lines at most.
- Terminals: 8 live at once per module. A ninth `create()` rejects with "This module already has 8 terminals open. Close one
  before you open another."
- Resize: 1 to 1000 rows and 1 to 1000 columns.
- The widget's code (xterm.js) loads on the first `create()`. A module that never creates a terminal never loads it.

## Lifetime and cleanup

- A terminal lasts until you call `dispose()`, or until the module is unloaded or its start-up fails. The shell then disposes
  every terminal the module made.
- After the module is unloaded or abandoned, `create()` is refused with a plain message.
- A handle you kept answers quietly once it is disposed: writes are dropped, `size()` gives the default size, `getText()`
  gives an empty string and `copy()` rejects with "This terminal is closed."

## Pairing with the Tactical terminal socket

```js
const session = await context.tacticalWebSocket.open('remote-background', 'agent-terminal', { agentId })
const terminal = await context.terminal.create(host, {
  onInput: (data) => session.input(data),
  onResize: ({ rows, cols }) => session.resize(rows, cols),
})
session.on('output', ({ output }) => terminal.write(output))
session.on('close', ({ message }) => terminal.writeln(message))
copyButton.onclick = () => terminal.copy().then(() => notify('Terminal output copied to clipboard.'), () => notify('Failed to copy terminal output.'))
session.start({ shell: '', runAsUser: false })
```

Wait until `create()` resolves before you call `session.start()`, so the first output has a place to go.

## Requirements

- UI 0.12.104 or later.
- The widget's stylesheet and code ship in the signed build. Nothing is fetched from another site.
- The Core browser contract row `ui.authenticated.terminal` lists the operations above. Core writes the export row
  (`reviews/requests/core.md`). Until the export lists it, a module that depends on the row says so in its own release notes.
- Registered by `register(context)` only. `registerPublic(context)` gets no terminal, because the public pages are signed out.

## Licence

The widget uses xterm.js (`@xterm/xterm` 5.5.0 and `@xterm/addon-fit` 0.10.0), both MIT licensed. The licence text ships
with the build at `/tec-tac/licenses/xterm-LICENSE.txt`. The package list is in `THIRD-PARTY-NOTICES.md` at the root of the
UI source.
