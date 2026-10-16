# Shared components for modules (SearchSelect and TagEditor)

Core UI 0.12.111 gives every authenticated module two components, so no module needs a private script picker or tag editor.
They follow the brand board patterns **P6** (script and report picker) and **P7** (argument entry), in
`docs/ui-brand-board/`.

```js
export default {
  register(context) {
    const { SearchSelect, TagEditor } = context.components
    // use them in a render function: context.Vue.h(SearchSelect, { ... })
  },
}
```

- They are plain Vue 3 components written with render functions, so a module needs no template compiler. Use them with
  `context.Vue.h(SearchSelect, props)`.
- They keep only transient input state (the typed text and whether the list is open). **The value stays with the module.**
  They emit `update:modelValue` and never store it.
- Every label, description and value is shown as text. Markup in a value stays visible as typed.
- `registerPublic(context)` does not get `components`. Public pages build their own screens.
- Nothing is restyled and no existing screen changes. Modules adopt the components at their next release; nobody rebuilds
  only for this.
- Needs Core UI 0.12.111 and Core 1.17.41 or later (the UI release that carries them requires Core 1.17.41).
- The classes are Core's: `tt-combo`, `tt-input`, `tt-star`, `tt-chip`, `tt-tagbox`, `tt-tag`, `tt-field`, `tt-help` and
  `tt-error`. A module does not redefine them. It may wrap a component in `.tt-field` with a `label` (the label rule is the
  board's), and may show help text in `.tt-help` and its own error in `.tt-error`.

## SearchSelect (P6)

One control that picks one item from a list and searches as you type.

| Prop | Default | Meaning |
|---|---|---|
| `modelValue` | `null` | The chosen option's `value`. `null` means nothing chosen. |
| `options` | `[]` | `[{ value, label, description, favourite, chip, chipTone, disabled, searchText }]`. |
| `placeholder` | none | Placeholder text of the input. |
| `inputId` | none | `id` of the input, so a `<label for>` can name it. |
| `ariaLabel` | none | Accessible name when there is no label. |
| `disabled` | `false` | Turns the control off. |
| `clearable` | `false` | Shows a clear button once something is chosen. |
| `emptyText` | `No matches. Check the spelling.` | Line shown when the search matches nothing. |
| `favouriteLabel` | `Favourites` | Heading of the favourites group. |
| `allLabel` | `All` | Heading of the other group. |
| `serverSearch` | `false` | Server mode (0.12.112). The module owns the search: the component skips its own filter and the 300-row cap. See "Server search and paging". |
| `loading` | `false` | Shows one quiet "Loading…" line in the list and sets `aria-busy`. |
| `hasMore` | `false` | The module has more rows to load. Used with the `more` event. |
| `selectedLabel` | none | Text to show for the chosen value when it is not in the loaded rows. |

Option fields: `value` (any value you can compare with `===`), `label` (what the input shows once chosen), `description` (a
second line, quiet colour), `favourite` (`true` puts the row in the favourites group with a star), `chip` (a short tag such as
the shell or report type), `chipTone` (`shell`, `accent`, `ok`, `warn` or `danger`; anything else gives no colour),
`disabled` (`true` shows the row but it cannot be chosen) and `searchText` (extra words the search also matches).

| Event | Payload | When |
|---|---|---|
| `update:modelValue` | the chosen `value`, or `null` after clear | An item is chosen or cleared. |
| `select` | the chosen option object, or `null` after clear | The same moment. Use it to fill default arguments and a timeout when a script is chosen (P6). |
| `search` | the typed text (empty when the list opens) | Server mode only. The component emits on every change; the module debounces. |
| `more` | none | Server mode only. The list reached its last row or its end and `hasMore` is `true`. |

Rules:

- One input with `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"` and `aria-activedescendant`.
  The list has `role="listbox"` and each row `role="option"` with `aria-selected`.
- The search matches the label, the description and `searchText`, ignoring case.
- Results are grouped: **Favourites** first (the star sits in the first column), then the rest. A group with no rows is not
  drawn. Headings show only when there is a favourites group.
- Each row shows the name, a second line with the description and an optional chip.
- Opening the list shows every option with the chosen row highlighted. Typing filters it. (This is a small step from the
  board's script, which filters by the chosen name; Johan's question Q63 holds the decision.)
- Keys: ArrowDown opens the list or moves down, ArrowUp moves up, Enter chooses the highlighted row, Escape closes the list and
  stops there so an enclosing popup stays open, Tab closes the list and moves on. Disabled rows are skipped by the arrows and
  cannot be chosen.
- A mouse press on a row chooses it and does not take the focus from the input. When the input loses focus the list closes,
  and the chosen label comes back if the typed text chose nothing.
- The list shows at most **300 rows** (`SELECT_LIMITS.maxRows`) and then the line
  "Showing the first 300. Keep typing to narrow it."
- The list is placed from the input's rectangle with `position: fixed`, above or below as there is room, so a scrolling dialog
  such as `.modal-wide` does not cut it off.

### Server search and paging (0.12.112)

For a list too long to load at once, such as thousands of agents, the module searches and pages on the server. Every prop and
event below is off by default, so a picker that does not use them behaves exactly as before.

- `serverSearch` turns server mode on. The component does not filter the options and does not apply the 300-row cap. It shows
  the options exactly as given, up to **1000 loaded rows** (`SELECT_LIMITS.maxServerRows`), and then the line
  "Showing the first 1000 loaded. Keep typing to narrow it."
- `search` carries the typed text. The component emits on every change and when the list opens (then the text is empty). The
  module debounces and loads. Typing never changes `modelValue`: the value stays with the module.
- `loading` shows one "Loading…" line (`SELECT_LIMITS.loadingText`) after the rows, or alone when there are none, and sets
  `aria-busy`. While it is `true`, "No matches" is not shown.
- `hasMore` with `more`: when `hasMore` is `true` and the highlight reaches the last row, or the list is scrolled to its end,
  `more` fires once. It does not fire again until `options` changes or `loading` goes back to `false`. The module appends the
  next page to `options`.
- `selectedLabel` is the label for a chosen value that is not in the loaded rows (the person picked it on an earlier search).
  Without it the input would be empty. Text only.
- Static lists keep the local filter and the 300-row cap.

```js
h(SearchSelect, {
  serverSearch: true, options: rows, loading: busy, hasMore: next !== null,
  modelValue: agentId, selectedLabel: agentName,
  onSearch: (text) => debouncedLoad(text), onMore: () => loadNextPage(),
  'onUpdate:modelValue': (v) => { agentId = v },
})
```

Contract row `ui.authenticated.components` gains these props and events. They are not yet in the export; Core writes the row
(`reviews/requests/core.md`).

## TagEditor (P7)

A list of text values, one per tag, typed into one box.

| Prop | Default | Meaning |
|---|---|---|
| `modelValue` | `[]` | Array of strings. |
| `placeholder` | none | Placeholder text of the input. |
| `ariaLabel` | none | Accessible name of the input. |
| `disabled` | `false` | Turns the editor off. |
| `readonly` | `false` | Shows the values with no input and no remove buttons. |
| `maxItems` | `200` | Most values allowed. |
| `maxLength` | `500` | Most characters in one value. |
| `commaAdds` | `true` | A comma adds the typed value. Turn it off when a value may hold a comma. |
| `validate` | none | `validate(value)` returns `''` for a good value or a plain sentence for a bad one. |

| Event | Payload | When |
|---|---|---|
| `update:modelValue` | the new array of strings | A value is added or removed. |
| `reject` | `{ value, reason }` | A value is refused. `reason` is the plain sentence shown to the person. |

Rules:

- Enter adds the typed value, and so does a comma when `commaAdds` is on. Backspace in an empty box removes the last value.
  Each tag has a remove button with `aria-label` "Remove <value>". Leaving the box adds what was typed.
- Values are trimmed. An empty value and a duplicate are ignored without a message. Control characters (tab, line breaks and
  the like) are stripped.
- A value longer than `maxLength`, a value past `maxItems` and a value `validate` refuses are rejected: the sentence shows under
  the box (`role="alert"`), `reject` fires and the typed text stays in the box so it can be fixed.
- With `commaAdds` on, pasted text such as `a,b` becomes two values. With it off the whole text is one value.
- A value is shown in the mono font exactly as it will be sent. Clicking the box puts the cursor in the input.
- The box is `.tt-tagbox`, so inside a `.tt-field` the input stays borderless (the field rule applies to direct children only).

## Limits

| Limit | Value | Constant |
|---|---|---|
| Rows in the SearchSelect list | 300 | `SELECT_LIMITS.maxRows` |
| Loaded rows in a server-mode list | 1000 | `SELECT_LIMITS.maxServerRows` |
| Values in a TagEditor | 200 | `TAG_LIMITS.maxItems` |
| Characters in one tag | 500 | `TAG_LIMITS.maxLength` |

## Contract row

Browser contract row `ui.authenticated.components` (phase `authenticated`, services `SearchSelect` and `TagEditor`). Core writes
the export row; see `module-runtime-api.md`.

## Adoption

Script Manager (the board's reference), Tasks, Checks, Agents Run script, Script Execution, Report Manager schedules and Remote
Background Send command use a private picker or tag editor today. Each moves to these components at its next release and names P6
and P7 in its release notes (`reviews/requests/core-modules.md`).
