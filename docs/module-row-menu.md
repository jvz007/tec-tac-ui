# Module row menu

A module table can show a right-click menu without drawing its own. The shell places it, handles the keys and closes it. Your module says what is in it and what each item does. The menu looks and behaves like the Clients and Sites menu, so no module needs a private one.

The row menu arrived in UI 0.12.112. A module built before that release still loads and works. `rowMenu` is simply there in `register(context)`, and a menu you draw yourself keeps working.

**Contract row (UI 0.12.112, listed in the public contract export from 1.17.50-0.12.115).** Browser contract row `ui.authenticated.rowMenu` (phase `authenticated`, service `rowMenu`): `open({ event, element, label, items })` and `shouldHandle(event)`; item fields `id`, `label`, `hint`, `danger`, `disabled`, `reason` and `run`; at most 40 items; layer 1150; no `registerPublic` access. Core lists it in the public contract export from 1.17.50-0.12.115.

## The API

```js
export default {
  register(context) {
    const { rowMenu } = context

    function onContextMenu(event, row, rowElement) {
      // A right-click on a text field keeps the browser's own menu (copy, paste, spell check).
      if (!rowMenu.shouldHandle(event)) return
      event.preventDefault()
      rowMenu.open({
        event,
        element: rowElement,
        label: `Actions for ${row.name}`,
        items: [
          { id: 'edit', label: 'Edit', hint: 'Enter', run: () => edit(row) },
          { id: 'run', label: 'Run now', disabled: !row.online, reason: 'The agent is offline.', run: () => runNow(row) },
          { id: 'delete', label: 'Delete', danger: true, run: () => remove(row) },
        ],
      })
    }

    // The Menu key and Shift+F10 give the shell no pointer position, so the menu opens under the focused row.
    function onKeydown(event, row, rowElement) {
      if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
        event.preventDefault()
        rowMenu.open({ event, element: rowElement, items: itemsFor(row) })
      }
    }
  },
}
```

`rowMenu.open({ event, element, label, items })` returns `true` when the menu is shown.

- `event`: the `contextmenu` or `keydown` event. A mouse gives the pointer position. A key gives none (or 0, 0), so the shell places the menu under `element`.
- `element`: the row that has focus. Focus goes back to it when the menu closes. Without it, focus goes back to whatever had it.
- `label` (optional): the accessible name of the menu, plain text, at most 80 characters. The default is "Actions".
- `items`: a list of 1 to 40 items.

Item fields:

- `id` (required): letters, digits and `_`, `-`, `.`, `:`, at most 64 characters, and not used twice in one menu.
- `label` (required): plain text, at most 80 characters.
- `hint` (optional): a second line in a quiet colour, plain text, at most 120 characters. A shortcut or a short note.
- `danger` (optional): `true` shows the item in the danger colour.
- `disabled` (optional): `true` shows the item but it cannot be chosen. It needs no `run`.
- `reason` (optional): the line shown under a disabled item, plain text, at most 120 characters. The default is "Unavailable for this selection."
- `run()` (required unless `disabled`): called once when the person chooses the item. The menu closes first.

`rowMenu.shouldHandle(event)` returns `false` for a right-click on a text field (an input, a textarea, a select or an editable element), which the browser keeps. It returns `true` otherwise.

## Rules

- **Plain text only.** Labels, hints, reasons and the menu label are shown as text. Markup stays visible as typed. Control and zero-width characters are replaced by a space.
- **Hide what is denied.** An action the person is not allowed to do is left out of `items` (AD-12). An action that is allowed but not possible right now is `disabled` with its `reason`.
- **At most 40 items.** More is a `TypeError`. A menu with no items, an item without an `id` or a `label`, a repeated `id`, and an enabled item without `run` are also a `TypeError`.
- **One menu at a time.** A second `open()` replaces the first, as a right-click on another row does.
- **Bound to your module.** Your `run()` functions belong to your module. After the module is unloaded or fails, `open()` is refused and no item runs.
- **Errors stay in your module.** An error in `run()` (or a rejected Promise from it) is caught and logged as one warning that names your module. It never reaches the shell.
- **Refused in some places.** `open()` throws a plain error (status 0, no code) in a popup window, while signed out, and outside a signed-in Tec-Tac session.
- **Closed by the shell.** Escape and Tab close it. Arrow keys, Home and End move between the items. An outside press, a scroll, a resize, the window losing focus and a route change close it too, and so do sign-out, an invalid session, leaving the page and unloading your module. Focus returns to the row.
- **Layer 1150.** The menu is above a module dialog (1100), under toasts (1200), the unsaved-changes prompt (1300) and the Yes or No confirm (1400). A menu opened in a dialog's table sits above the dialog. The shell's own right-click menu on Clients and Sites stays at 1000.
- **No `registerPublic` access.** Public pages get no `rowMenu`.
- **No new look.** The menu uses the existing `.resource-menu` styles, with no new colours.

## Adoption

Checks 0.16.0 keeps its private `.ck-row-menu` code and works as before. It moves to `context.rowMenu` at its next release (`reviews/requests/core-modules.md`). No other module is changed by this release.
