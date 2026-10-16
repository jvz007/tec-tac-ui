# Module dialogs

A module can open a dialog above the page, in the same layer as Quick Actions. The shell draws the box and the rules around it. Your module draws what goes inside. Use it for a short task such as a wizard, an input form or a result that needs the person's full attention. Pattern P4 (input dialog) and P9 (result dialog) in the brand board are the spec.

Dialogs arrived in UI 0.12.112. A module built before that release still loads and works. The `dialogs` object is simply there in `register(context)`, and nothing you already ship changes.

**Contract row (UI 0.12.112, not yet in the export).** Browser contract row `ui.authenticated.dialogs` (phase `authenticated`, service `dialogs`): `register(descriptor)` and `open(id or descriptor)`, descriptor fields `id`, `title`, `size` (`'default'` or `'wide'`), `mount(element, { close })` and `beforeClose()`; one dialog at a time; layer 1100. Core writes the export row. This release does not claim the export lists it, so the row is named as "not yet in the export" until Core writes it (`reviews/requests/core.md`).

## The API

`context.dialogs.register(descriptor)` names a dialog. `context.dialogs.open('<local id>')` opens a registered one, and `context.dialogs.open(descriptor)` opens one given in the call. The example below uses `dialogs` from `register(context)`.

```js
export default {
  register(context) {
    const { dialogs } = context

    // Name a dialog once. The sign-in landing check can point at it as '<module id>.<dialog id>'.
    dialogs.register({
      id: 'wizard',
      title: 'Set up the module',
      size: 'wide',
      mount(element, { close }) {
        element.textContent = 'Step 1 of 3'
        return () => { /* cleanup: remove listeners and timers */ }
      },
      beforeClose() {
        return hasUnsavedWork() ? askMe() : true
      },
    })

    // Open it by its module-local id, from a button, a route or a context action.
    addButton.onclick = () => dialogs.open('wizard')
  },
}
```

`dialogs.open(descriptor)` also works when you do not want to register the dialog first. The descriptor takes the same fields.

Descriptor fields:

- `id` (required): module-local, letters, digits, `_` and `-`, at most 64 characters, and no dot. The full id is `<your module id>.<id>`, so a dialog id `wizard` in module `welcome` is `welcome.wizard`. A dot in the id is a `TypeError`.
- `title`: plain text, at most 200 characters. Control and zero-width characters are removed. A missing title shows as "Dialog". The title is never read as HTML.
- `size`: `'wide'` gives the 760px panel (the existing `modal-wide`). Anything else gives the 520px default.
- `mount(element, { close })` (required): draws into `element`. It may return a cleanup function, or an object with `unmount()`. It may be `async`. `close()` closes the dialog at once and does not ask `beforeClose()`.
- `beforeClose()` (optional): asked before the person closes the dialog by Escape, the close button or a click on the backdrop. Return `false`, or a Promise of `false`, to keep the dialog open. Return anything else, or nothing, to let it close. Throwing or rejecting also keeps it open, and the shell logs one warning that names your module. Use it for an unsaved-changes check.

`dialogs.open(...)` returns a Promise that resolves when the dialog closes. Await it only if you need to know that it closed.

## Rules

- **One dialog at a time.** A second `open` while one is open is refused. The refusal is a rejected Promise with an `Error` that has `status` 0 and no `code`.
- **Your own dialogs only.** `open('x')` opens a dialog your module registered. A dialog id that names another module is refused. The shell binds every call to your module id, so you cannot open another module's dialog.
- **Refused in these cases:** a popup window, while the person is signed out, outside a backend-supplied context (the page is not a signed-in Tec-Tac session), after your module failed or timed out in `register()`, after your module was unloaded (switched off or uninstalled while the page is open), and for an id you did not register.
- **Close paths.** Escape, the close button and a backdrop click all ask `beforeClose()` first. The dialog closes without asking when the person signs out, when the session ends, when your module is unloaded and when the page is left. A dialog that failed to open closes at once, because there is nothing in it to lose.
- **Focus.** On open the shell puts focus on the first control in your content, or on the dialog panel itself when there is none. Tab and Shift+Tab stay inside the dialog. When the dialog closes, focus returns to the control that opened it, if it is still on the page.
- **Mount limit.** `mount` must finish within the module start-up time limit, `context.module_register_timeout_seconds` (5 to 300 seconds, 30 by default). If it does not, the dialog shows a plain line "This dialog did not open within N seconds." with a Close button, and the content area is cleared. A late result is cleaned up at once. A `mount` that throws or rejects shows "This dialog could not be shown." and logs the cause to the console. You never get a blank panel.
- **Cleanup.** Your cleanup runs once, when the dialog closes, and the content area is emptied after it.
- **Text, not markup.** The title and the error line are text. Your content is yours to draw; the shell never runs HTML from a title.
- **Popups.** A popup window has no dialog host, so `open` is refused there. Use a popup for a whole page and a dialog for a short task on the page.

## Where it sits

| Layer | z-index |
|---|---|
| Module dialog (this) | 1100, the same layer as Quick Actions |
| Popovers, help | 900 to 1000 |
| Unsaved-changes prompt | 1300, above a module dialog, so it is never hidden under one |
| Shell Yes or No confirm | 1400, above both |
| Toasts | 1200 |

Escape belongs to the top layer. While the Yes or No confirm or the unsaved-changes prompt is open, the module dialog does not take the keys. While a module dialog is open, Escape does not close Quick Actions, help or the notice drawer underneath it.

## Looks

The panel uses Core's `modal-panel` and the existing theme tokens. It works in dark, light and high-contrast themes and scales with the text-size setting. A module does not need to style the frame. Your content can use Core's classes, `context.components` and the shared primitives in `module-components.md`.

## Limits and what is left out

- No second dialog at once, and no dialog in a popup window.
- A dialog cannot be dragged, resized or moved between windows.
- A Yes or No question still goes through `context.confirm`, the shell's own dialog. A module dialog does not replace it, and a confirm opened from inside a module dialog sits above it.
- Opening a dialog from the sign-in landing check uses the same rules as above. See `module-sign-in-landing.md`.
- The shell does not check what you put inside the dialog. The backend still decides every action. Showing or hiding a button is never the permission check (AD-12).

## Backwards compatibility

No module in `modules/` uses `context.dialogs` when this was written, so the change is an addition. `registerPublic(context)` gets no dialogs. Modules that already open their own popups or modals keep them.
