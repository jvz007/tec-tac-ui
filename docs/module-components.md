# Shared components for modules (SearchSelect, TagEditor and the kit)

Core UI 0.12.111 gives every authenticated module two components, so no module needs a private script picker or tag editor.
They follow the brand board patterns **P6** (script and report picker) and **P7** (argument entry), in
`docs/ui-brand-board/`.

Core UI 0.12.114 adds four more: **DataTable** (P1), **FormRow** (P3), **EditorWindow** (P2) and **Stepper** (P5). They are described
after TagEditor, under "The component kit".

```js
export default {
  register(context) {
    const { SearchSelect, TagEditor, DataTable, FormRow, EditorWindow, Stepper } = context.components
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
| `inputId` | none | (0.12.118) The `id` of the real text input, so a label can name it. No id when absent. |
| `describedBy` | none | (0.12.118) The `aria-describedby` of the real text input. |
| `inputId` | none | `id` of the input, so a `<label for>` can name it. |
| `ariaLabel` | none | Accessible name when there is no label. |
| `disabled` | `false` | Turns the control off. |
| `clearable` | `false` | Shows a clear button once something is chosen. |
| `emptyText` | `No matches. Check the spelling.` | Line shown when the search matches nothing. |
| `favouriteLabel` | `Favourites` | Heading of the favourites group. |
| `allLabel` | `All` | Heading of the other group. |
| `required` | `false` | Sets `aria-required="true"` on the combobox input (0.12.114). |
| `invalid` | `false` | Sets `aria-invalid="true"` on the input and shows the invalid border (0.12.114). |
| `describedBy` | none | Sets `aria-describedby` on the input to this id, or to several ids separated by spaces (0.12.114). |
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

Contract row `ui.authenticated.components` gains these props and events. They are listed in the public contract export from 1.17.50-0.12.115.

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

## The component kit (0.12.114)

Four components for the screens the board calls P1, P2, P3 and P5. They are render-function components like the two above, they
keep no value of their own, and every label, title and cell is text (markup in a value stays visible as typed). They carry the
`tt-ws` work-surface scope, so they use the board's density without the module adding anything. Class names are the board's:
`tt-panel`, `tt-tablewrap`, `tt-table`, `tt-frow`, `tt-ctl`, `tt-win`, `tt-steps` and the parts inside them. A module does not
redefine them. **No component confirms or discards anything.** When a person closes a window with unsaved changes, the module asks
one plain Yes or No through `context.confirm`.

### DataTable (P1)

A table in a panel. The module owns the rows and the order; the component draws them and reports what the person did.

| Prop | Default | Meaning |
|---|---|---|
| `columns` | `[]` | `[{ key, label, sortable, align, width }]`. `align` is `left`, `right` or `center`. `width` is a number with `px` or `%`. At most 40 columns. |
| `rows` | `[]` | The row objects. At most 2000 are drawn, and the footer then says "Showing the first 2000 rows." |
| `rowKey` | none | The row field that identifies a row. Without it the position is used. A missing or repeated key never breaks the table. |
| `selectedKey` | `null` | The `rowKey` value of the selected row. |
| `sortKey` | `null` | The column the rows are sorted by. It gets `aria-sort` and an arrow. |
| `sortDir` | `null` | `ascending` or `descending`. |
| `loading` | `false` | Shows five skeleton rows and sets `aria-busy`. |
| `emptyTitle` | `Nothing to show` | Heading of the empty state (no rows, not loading). |
| `emptyText` | none | One line under the heading. |
| `footer` | none | One line under the table, for example a count. |
| `ariaLabel` | none | Accessible name of the table. |
| `cell` | none | `cell(row, column)` returns text or vnodes for one cell. Without it the cell shows `row[column.key]` as text. A function that throws shows an empty cell. |

| Event | Arguments | When |
|---|---|---|
| `sort` | `key`, `dir` | A sortable header was clicked, or Enter or Space was pressed on it. `dir` is the direction the click asks for: `ascending`, then `descending`, then `null` for no sort. The module sorts and passes `sortKey` and `sortDir` back. |
| `select` | `row` | A row was clicked, or Space was pressed on it. |
| `activate` | `row` | A row was double clicked, or Enter was pressed on it. |
| `rowmenu` | `row`, `event` | A right click on a row. The browser menu is replaced. Open `context.rowMenu` here. |

Keys: Tab reaches the selected row (or the first), ArrowUp and ArrowDown move between rows, Home and End jump to the ends. The
header stays in view while the table scrolls.

### FormRow (P3)

One settings row: the label in a 220px column and the control beside it. Under 760px the label stacks above the control. The
control goes in the default slot.

| Prop | Default | Meaning |
|---|---|---|
| `label` | none | The label text. |
| `hint` | none | A small line under the label. |
| `help` | none | A line under the control, in `.tt-help`. Its id is `forId + "-hint"`. |
| `error` | none | The error line under the control, shown with the leading cross and `role="alert"`. Its id is `forId + "-error"`. |
| `forId` | none | The `id` of the control, so the label names it. Give the control `aria-describedby` with the two ids above. |
| `stacked` | `false` | (0.12.118) Puts the label above the control at any width. Inside an editor window's properties column a row stacks on its own, so a 320px column does not squeeze the control. |

### EditorWindow (P2)

The window for editing one item: a header with the title, a properties column, a content area and a footer with the status, the
Discard button and the Save button.

| Prop | Default | Meaning |
|---|---|---|
| `title` | none | The window title. |
| `dirty` | `false` | Shows "Unsaved changes" and turns on Discard changes. |
| `canSave` | `false` | The module sets this when there is something valid to save. Save and Ctrl+S need it. |
| `saving` | `false` | Shows "Saving" and turns Save and Discard off. |
| `status` | none | The footer status line (read out politely). |
| `floating` | `false` | (0.12.118) Draws the window fixed over the page as a dialog on layer 1050. It takes the focus when it opens and gives it back to the opener when it closes. |
| `readOnly` | `false` | (0.12.118) Hides Save and Discard changes, for a viewer such as a log window. Close and Escape stay. |

**Layer order (0.12.118).** A floating window sits at 1050: above the resource menu (1000), below module dialogs and the SearchSelect list (1100), the row menu (1150), toasts (1200), the unsaved-changes prompt (1300) and the shell Yes or No confirm (1400). A confirm or a toast is never lost behind a module window. Without `floating` the window is drawn in the page flow as before.

| Area | Where |
|---|---|
| `actions` (slot) | Header buttons, left of the close button. |
| `properties` (slot) | The left column. Leave it out for a single content area. |
| `content` (slot, or the default slot) | The main area. |
| `footer` (slot) | Footer buttons, left of Discard and Save. |

| Event | When |
|---|---|
| `save` | The Save button, or Ctrl+S (Cmd+S), when `canSave` is true and `saving` is false. Ctrl+S never opens the browser's save dialog. |
| `discard` | The Discard changes button. |
| `close` | The close button, or Escape. Escape stops here, so a module dialog below does not also close. When `dirty` is true the module asks one Yes or No before it closes. |

### Stepper (P5)

A numbered list of steps for a create flow.

| Prop | Default | Meaning |
|---|---|---|
| `steps` | `[]` | `[{ key, label, state }]`. `state` is `done` or `error`; leave it out for a step still to do. At most 12 steps. |
| `current` | none | The `key` of the current step. It gets `aria-current="step"`. |
| `ariaLabel` | `Steps` | Accessible name of the list. |

| Event | Arguments | When |
|---|---|---|
| `select` | `key` | An earlier step was chosen. Later steps and the current step never emit, so Back never loses values and nobody skips ahead. |

## Limits

| Limit | Value | Constant |
|---|---|---|
| Rows in the SearchSelect list | 300 | `SELECT_LIMITS.maxRows` |
| Loaded rows in a server-mode list | 1000 | `SELECT_LIMITS.maxServerRows` |
| Values in a TagEditor | 200 | `TAG_LIMITS.maxItems` |
| Characters in one tag | 500 | `TAG_LIMITS.maxLength` |
| Rows drawn by DataTable | 2000 | `KIT_LIMITS.maxRows` |
| Columns in DataTable | 40 | `KIT_LIMITS.maxColumns` |
| Steps in Stepper | 12 | `KIT_LIMITS.maxSteps` |

## FilterEditor (universal filters)

Core UI 0.12.116 adds one more member to `context.components`: **FilterEditor**, the shared filter editor. It is a render-function
component like the others, but unlike them it is **bound to your module**: each module receives its own copy, fixed to its own id, so
there is no module id prop, and the editor only ever uses your module's own id. This is not a sandbox: the shared api helpers still
reach Core's filter routes, and Core, not the editor, decides what the signed-in person may read for any module id. The six other
members are the same objects as before.

```js
h(FilterEditor, {
  viewKey: 'agents', modelValue: definition,
  'onUpdate:modelValue': (v) => { definition = v },
  onApply: ({ definition, filterSetId }) => reload(definition, filterSetId),
})
```

- Props: `viewKey` (required, a lower-case slug of 1 to 61 characters), `modelValue` (a definition or `null`) and `disabled`.
- Events: `update:modelValue` (the definition) and `apply` (`{ definition, filterSetId }`, exactly one of them set; both `null` means no filter).
- It reads Core's fields, values and saved-sets routes only, builds every operator and value picker from Core's own answer, and saves
  Only me sets. The full description, the limits and Core's refusals are in `module-filters.md`. Needs Core 1.17.50 or later.
- Since UI 0.12.117 it also draws `date` and `number` fields (a date box, a day range, a relative amount and unit, a number box and a
  number range) from the field's own operators and the route's `relative_units`. A module declares such a field only once UI
  0.12.117 is installed, and Core 1.17.52 is needed for it to work. See "Date and number fields" in `module-filters.md`.

## Contract row

Browser contract row `ui.authenticated.components` (phase `authenticated`, services `SearchSelect` and `TagEditor`; since UI 0.12.114 also `DataTable`, `FormRow`, `EditorWindow` and `Stepper`; since UI 0.12.116 also `FilterEditor`, which is not yet in the export; UI 0.12.117 adds its date and number controls, also not yet in the export). Core writes
the export row; see `module-runtime-api.md`.

## Adoption

Script Manager (the board's reference), Tasks, Checks, Agents Run script, Script Execution, Report Manager schedules and Remote
Background Send command use a private picker or tag editor today. Each moves to these components at its next release and names P6
and P7 in its release notes (`reviews/requests/core-modules.md`).
