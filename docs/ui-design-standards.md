# Tec-Tac UI Design Standards

**Status:** Canonical UI contract for Tec-Tac Core and authenticated modules  
**Applies to:** Core views, module views, dialogs, resource contributions, settings pages, tables, forms and interactive controls  
**Goal:** A user should not be able to tell which team or module author built a screen from its visual language or interaction model.

## 1. Core rule

Modules must use the Tec-Tac visual language already provided by the shell. Do not ship a private design system, modal framework, toast framework, button set, table theme or competing typography unless Core has explicitly approved a new shared primitive.

Prefer existing Core classes and runtime services over custom CSS. Module-specific CSS should describe layout or domain-specific visualisation, not redefine standard controls.

The canonical source for shared visual styles is `src/styles.css`. This document defines how those styles are expected to be used.

## 2. Page structure

Every normal authenticated page should follow this hierarchy:

```html
<section>
  <div class="phead">
    <div>
      <span class="eyebrow">SECTION / CONTEXT</span>
      <h1>Page title</h1>
      <p>One short sentence explaining what the page controls or shows.</p>
    </div>
    <div class="row">
      <!-- page-level actions -->
    </div>
  </div>

  <!-- errors/notices -->
  <!-- page tabs when needed -->
  <!-- summary / primary content -->
</section>
```

Rules:

- One `h1` per page.
- Use `eyebrow` for compact context, not as a second title.
- Keep the description to one concise paragraph.
- Page-level actions belong in the right side of `phead`.
- Do not put a second navigation bar inside the page unless it represents tabs within that page.

## 3. Tabs

Use the Core `subtabs` visual pattern.

```html
<div class="subtabs module-tabs">
  <button class="active">
    <b>Overview</b>
    <span>Optional short secondary description</span>
  </button>
  <button>
    <b>History</b>
    <span>Recent activity</span>
  </button>
</div>
```

Tab rules:

- Tabs switch views inside the current route; they are not a substitute for left-navigation destinations.
- Use a short noun or noun phrase: `Overview`, `History`, `Configuration`, `Hotfixes`.
- The active tab must use the shared `.active` state.
- Do not use pill-shaped tabs, browser-like tabs, coloured tabs or module-specific tab CSS.
- If a configuration area has a different administrative audience or deserves a permanent route, make it its own Administration page instead of hiding it behind an operational tab.
- Preserve tab state only when there is a real user benefit; do not add persistence by default.

## 4. Buttons

Use `.btn` as the base class.

### Primary

```html
<button class="btn primary">Save</button>
```

Use for the single preferred action in the current scope: Save, Create, Install, Apply.

### Normal secondary

```html
<button class="btn">Cancel</button>
```

Use for safe secondary actions: Refresh, Cancel, Close, Inspect.

### Destructive

```html
<button class="btn danger">Delete</button>
```

Use only for destructive actions such as Delete, Remove, Revoke or Purge.

### Warning / elevated-risk

```html
<button class="btn warnbtn">Run dangerous test</button>
```

Use where an action is intentionally risky but not inherently destructive.

### Compact

```html
<button class="btn sm">Run now</button>
```

Use inside tables, compact toolbars or dense cards.

Button rules:

- Use verbs: `Save schedule`, `Run now`, `Delete`, `Refresh`.
- One primary action per visual scope.
- Destructive actions must never be styled as primary.
- Disable a button while its operation is in flight and change the label when useful (`Saving…`, `Deleting…`).
- Icon-only buttons must have `title` and `aria-label`.
- Do not create custom colours for normal actions.

## 5. Tables

Wrap tables in `.tablewrap`.

```html
<div class="tablewrap">
  <table>
    <thead>...</thead>
    <tbody>...</tbody>
  </table>
</div>
```

Rules:

- Table headers are nouns or short labels, not sentences.
- Put the primary identity/name in the first useful column.
- Secondary identifiers belong beneath the main value using `.sub`, normally with `.mono` for IDs.
- Use `.pill` for compact state values such as enabled, disabled, healthy, failed or queued.
- Use `.clickrow` only when clicking the row performs an obvious selection/edit action.
- A row action button must use `.btn.sm` and must call `stopPropagation()` if the row itself is clickable.
- Do not place long editable forms directly inside table rows.
- Empty tables should show an explicit empty state rather than an empty frame.
- Errors/results too long for the normal cell should truncate visually and expose the full value through a title, detail panel or data-display dialog.

**Opt-in table style (UI 0.12.100): `table-clean`.** Add `table-clean` to the wrap: `<div class="tablewrap table-clean">`. It gives a tighter header that stays visible while the rows scroll (the wrap scrolls at 70% of the window height or 640 px, whichever is smaller), a hover and a selected row, an empty state (`td.table-empty` in the last row) and truncation (`td.cell-truncate` with a `title`). Row actions go in `td.row-actions`. The base `table`, `thead th` and `tbody td` rules are unchanged, so a table without `table-clean` keeps its look. Core's API keys, SSO providers and Users tables use it.

## 6. Status pills

Use `.pill` with standard semantic states:

- `.pill.ok` — successful, healthy, enabled, active.
- `.pill.warn` — queued, unknown, disabled when attention may be needed, caution.
- `.pill.danger` or the Core danger treatment — failed, blocked or critical.

Do not encode important state by colour alone; always include text.

## 7. Forms

Use `.field`, `.field-grid`, `.checkline` and the existing Core input styles.

```html
<label class="field">
  <span>Name</span>
  <input v-model="draft.name">
</label>
```

Rules:

- Every input needs a visible label unless it is a universally understood compact search field with an accessible label.
- Related fields may use `.field-grid`.
- Keep advanced/raw JSON behind an explicit advanced path when a structured editor is available.
- Validation errors should sit close to the affected field or in the page/dialog error region.
- Do not use placeholder text as the only field label.
- Use native input types (`email`, `password`, `time`, `datetime-local`, `number`) when appropriate.

## 8. Dialog / popup types

Tec-Tac distinguishes between three dialog types. Modules must choose the correct one.

### 8.1 Confirmation dialog

Purpose: ask the person to confirm an action that changes or deletes something. Johan signed this as AD-27 on 12 October 2026.

Examples: delete a schedule, remove an assignment, run an immediate action on many endpoints.

A confirmation is one plain Yes or No question, asked through the shell dialog. Use `context.confirm(options)` from `register(context)`, or the `confirm` key a context action handler receives. Both open the same dialog (UI 0.12.96).

```js
const ok = await context.confirm({ question: 'Delete policy Servers?', target: 'Servers' })
if (!ok) return
```

Rules:

- One question with Yes and No. The question names the target. For a bulk action it also says how many endpoints (`count`).
- The title is "Are you sure?". Focus starts on No. Escape answers No.
- No typed name, hostname, alert number or count. No form fields in a confirmation.
- Do not use `window.alert`, `window.confirm` or `window.prompt` in modules, and do not build an OK or Cancel pair in your own markup.
- Permissions, scope, caps and audit rows do not change. Confirming is never authorisation (AD-12).
- These system-breaking actions keep the stricter confirmation they have today: Restore a backup, Purge storage, Delete a client or a site, and the AD-20 hand-back step on Modules. Do not copy that stricter form for anything else.
- A module keeps its own typed confirmation until its next release adopts the shell dialog. Nobody rebuilds a module only for this.
- The consequential choice is still the one the person has to pick on purpose: the dialog keeps No as the default.

The options and the full contract are in [module-runtime-api.md](module-runtime-api.md#confirmoptions). The decision is AD-27 in `docs/review-accepted-decisions.md`.

### 8.2 Input/action dialog

Purpose: collect or edit data and then perform an action.

Examples: Pair Storage, create API token, change assignment, configure a report.

Rules:

- Contains `.field` controls.
- Footer uses `.modal-actions`.
- `Cancel` is secondary; Save/Create/Apply is primary.
- If values are dirty, do not silently close on backdrop click. Use Core unsaved-change handling where appropriate.
- Validation happens before submission and server errors remain visible inside the dialog.
- The dialog title describes the action: `Pair storage`, `Create token`, `Edit assignment`.

**Wide dialog with tabs (UI 0.12.100): `modal-wide` and `dialog-tabs`.** A long form may be split into sections. Add `modal-wide` to the panel (`<section class="modal-panel modal-wide">`, up to 760 px, full width on a phone). Put a tab strip under the title: `<div class="dialog-tabs" role="tablist">` with one `<button role="tab" aria-selected="true|false" aria-controls="...">` per section, and one `role="tabpanel"` per section. Arrow keys move between tabs and wrap; Home and End go to the first and last tab (`nextTabIndex` in `src/dialog-tabs.js`). The footer stays `.modal-actions` for every section. The SSO provider form (Provider, Sign-in role) is the first user. Keep a dialog with few fields as a plain `.modal-panel`.

### 8.3 Data-display dialog

Purpose: show detail that is too large/dense for a table or card. It does **not** collect data.

Examples: execution result, raw response, vulnerability detail, audit record.

Rules:

- Read-only content only.
- Close action only, unless a safe secondary action such as Copy or Download is relevant.
- No Save/Apply button.
- Use `.mono` for logs, identifiers or raw payloads.
- Prefer a larger modal width only when the data genuinely needs it.

## 9. Cards and summary tiles

Use `.card` for grouped controls/details and `.tile` for small numerical/status summaries.

Cards should have a `.cardhead` when they have a title. Do not nest multiple bordered cards simply to create spacing.

Use summary tiles sparingly. They should answer immediate operational questions, not repeat table content verbatim.

### 9.1 Stable release under a branch (System Updates)

When a System Updates card has a branch as its saved source, the branch stays the headline (Discovered version, Installed, Comparison). Core 1.17.4 adds `stable_release`, and the card shows it as one secondary row, "Stable release", directly beneath the branch rows. The row shows the tag, the published date, a muted STALE pill when Core served a cached copy, the signed or unsigned badge with acceptance, and the operation. A release lookup error (`release_error`) shows as a muted line inside that row and never in the branch error area. With nothing known yet it says "Not checked yet". A Core older than 1.17.4 sends no `stable_release` key, so no row is drawn. Superusers (the same rule as the Update source control; Core 1.17.5 refuses anyone else) also get a "Use stable release" button that saves the Release source and checks again. It stages and installs nothing. Core still enforces the permission. The badge and its popover are one shared block (`ReleaseTrustBadge.vue`), used by both the release rows and this row.

### 9.2 Tactical colours and dates (UI 0.12.106, colours always applied from 0.12.107, loading bar theme default from 0.12.108)

The person's five Tactical colours (Core 1.17.35) are published as CSS custom properties on the document root. Since UI 0.12.107 Tec-Tac always sets the four figure colours for a signed-in person, Tactical's own defaults included, so the shell shows Tactical's palette. Since UI 0.12.108 the loading bar is the exception: its default is the theme colour, not Tactical's red. A sign-out removes all five properties and the theme tokens take over.

| Tactical field | CSS custom property | Tactical default | Theme token used when signed out | Shown in High contrast |
| --- | --- | --- | --- | --- |
| `loading_bar_color` | `--tactical-loading-bar-color` | `red` (the name `red`, an empty or unknown value means the theme colour) | `--loading-bar` (the loading bar, section 11): soft blue in Dark, royal blue in Light, green in High contrast | `--loading-bar` (green; the saved colour is ignored) |
| `dash_info_color` | `--tactical-dash-info-color` | `info` | `--accent` | `--accent` |
| `dash_positive_color` | `--tactical-dash-positive-color` | `positive` | `--ok` | `--ok` |
| `dash_negative_color` | `--tactical-dash-negative-color` | `negative` | `--danger` | `--danger` |
| `dash_warning_color` | `--tactical-dash-warning-color` | `warning` | `--warn` | `--warn` |

- Use a dashboard figure's colour through the `tone-*` class of its metric card (`.dashboard-core-metric.tone-info`, `tone-positive`, `tone-negative`, `tone-warning`). The CSS reads the property and falls back to the token: `color: var(--tactical-dash-info-color, var(--accent))`. Module pages do not read these properties in this release.
- High contrast does not read the Tactical colours. `:root[data-theme="high-contrast"]` has one rule per tone class and one for the loading bar, each using the theme token, so its accessible palette holds. A theme switch needs no JavaScript.
- A value the shell cannot show (an unknown name, a numbered Quasar shade such as `deep-purple-3`, or anything else) sets that field's Tactical default instead, so the Tactical palette still shows and nothing hostile is ever set. The loading bar is the exception since UI 0.12.108: there, an unshowable value removes the property, so the theme colour shows.
- Brand names are Tactical's own Quasar brand colours: `info` `#31CCEC`, `positive` `#21BA45`, `negative` `#C10015`, `warning` `#F2C037`. Base names (`red`, `teal` and so on) are the Material 500 values Quasar uses for them. `src/tactical-ui-apply.js` holds both tables.
- A sign-out removes all five properties. One watch in `App.vue` sets and clears them.

Dates on Core's pages come from one helper, `formatDateTime(value)` in `src/date-format.js`. It uses the person's Tactical date format (`context.tactical_ui.date_format`) when one is set, with Quasar-style tokens (`YYYY`, `MMM`, `DD`, `Do`, `dddd`, `HH`, `hh`, `mm`, `ss`, `SSS`, `A`, `a`, `Z`, `ZZ`) and `[escaped text]`, and it falls back to the browser's `toLocaleString()` when the format is empty. An invalid date shows the raw value. Do not call `toLocaleString()` on a date in a Core page. Module pages keep `context.dateTimeFormat` (the server default) in this release.

## 10. Notices, errors and toasts

For transient user feedback from a module, use the Core `notifications` runtime service. Do not implement module-specific toast markup.

Use inline page states for content that must remain visible in context:

- `.state-inline` — neutral state/message.
- `.state-inline.warning` — caution.
- `.auth-error` or the Core error treatment — failed request or blocking error.

Examples:

- `Settings saved` → toast/notification.
- `No schedules configured` → inline empty state.
- `API request failed` → inline error and optionally an error toast when immediate attention is useful.

## 11. Loading, empty and error states

Every data-backed surface must account for:

1. loading;
2. loaded with data;
3. loaded with no data;
4. recoverable error.

Do not leave an empty table while loading. Do not display `undefined`, `null` or raw JavaScript exceptions as normal UI copy.

Until Core ships dedicated shared state components, use the established `callout`, `state-inline` and error patterns consistently.

**Top loading bar (UI 0.12.107).** While Tec-Tac is waiting on the server, a thin 4px bar sweeps across the top of the window, above the top bar and the dialogs. It takes the person's Tactical loading bar colour when they have chosen one. Until then it uses the theme's loading bar colour, `--loading-bar` (UI 0.12.108): soft blue in Dark (`#4dabf7`), royal blue in Light (`#2b5fd9`, 5.3 to 1 on the page background) and green in High contrast (`#00ff5f`, which ignores the saved colour). Tactical's default name `red` counts as not chosen, so the theme colour shows; a person who wants Tactical's red types `#F44336`. Every request made through `src/api.js` counts toward it, so a module's calls show it with no extra work. The bar appears only after a request has taken about 300 ms, and it stays for a short minimum, so quick calls do not flicker. Core's own background polls (session heartbeat, notices) never show it. With reduced motion the bar is static. It is decoration plus a screen-reader status ("Loading"); it does not replace a page's own loading state, which a page still shows in its content.

## 12. Search and filters

Search/filter controls should be compact and sit above the content they filter.

Rules:

- Provide a clear `×` when a query is present.
- Escape should clear the active query where practical.
- Filtering should happen without a second Submit button unless the backend query is intentionally expensive.
- Show how many rows/results are currently displayed when useful.

## 13. Navigation

Modules contribute navigation through `addNavigation()` only.

- Do not render a second application sidebar.
- Do not move a module into `Administration` merely because it has settings; operational pages belong in the relevant operational section and administrative configuration may have its own Administration route.
- Module visibility is controlled by Core/module state; hiding a navigation item is never authorization.

## 14. Typography and identifiers

Use normal UI type for human-readable values. Use `.mono` for:

- IDs;
- hashes;
- versions;
- timestamps when dense/technical;
- command output/logs;
- API capability/action identifiers.

Do not use monospace for entire forms or prose sections.

## 15. Responsive behaviour

Module pages must remain usable at narrower desktop/tablet widths.

- Prefer CSS grid with a single-column fallback.
- Side editors/detail cards should collapse below the main content on narrow screens.
- Tables may scroll horizontally inside `.tablewrap`; never force the entire Tec-Tac shell wider than the viewport.
- Avoid hard-coded pixel widths for the whole page.

## 16. Accessibility baseline

Modules must:

- use semantic buttons for actions;
- label form inputs;
- provide `aria-label` for icon-only controls;
- ensure keyboard access to tabs/dialog actions;
- preserve visible focus behaviour;
- include textual status in addition to colour;
- avoid auto-opening destructive dialogs/actions.

## 17. Module CSS boundary

A module may add CSS for domain-specific layout and visualisations, but it must not redefine global Core selectors such as:

```text
.btn
.card
.tablewrap
.tablewrap.table-clean
.modal-backdrop
.modal-panel
.modal-panel.modal-wide
.dialog-tabs
.subtabs
.field
.pill
```

The three classes added in UI 0.12.100 (`table-clean`, `modal-wide`, `dialog-tabs`) are Core's. A module uses them as they are and never restyles them.

If a shared primitive is missing, raise it as a Core UI requirement instead of cloning/reimplementing the primitive in the module.

## 18. Recommended module page skeleton

```html
<section>
  <div class="phead">
    <div>
      <span class="eyebrow">EXTENSIONS / EXAMPLE</span>
      <h1>Example</h1>
      <p>Explain the operational purpose of this page.</p>
    </div>
    <button class="btn primary">New item</button>
  </div>

  <div class="subtabs">
    <button class="active"><b>Items</b><span>Current records</span></button>
    <button><b>History</b><span>Recent activity</span></button>
  </div>

  <div class="tablewrap">
    <table>...</table>
  </div>
</section>
```

## 19. Review checklist for module agents

Before shipping a module UI, confirm:

- page uses the standard header hierarchy;
- tabs use `subtabs` and only represent in-page views;
- normal, primary, warning and destructive buttons use Core classes correctly;
- tables use `tablewrap`, `.sub`, `.mono` and pills consistently;
- dialogs are correctly classified as confirmation, input/action or data-display;
- confirmations use the shell Yes or No dialog (`context.confirm`) and ask for no typed text, except the four system-breaking actions in section 8.1;
- no native `alert/confirm/prompt` calls are introduced;
- no custom toast system is introduced;
- loading, empty and error states exist;
- searches have a clear path;
- module CSS does not override Core primitives;
- optional integrations disappear/degrade cleanly when their provider is unavailable;
- backend authorization remains authoritative regardless of what UI is hidden.

## 20. Change control

This document is part of the public Tec-Tac module UI contract. Shared look-and-feel changes should be made here and in Core styles/components first, then adopted by modules. Module authors should not independently reinterpret these standards for a single module.

## 21. Help and documentation

User-facing Help is a Core-owned surface.

- Use the shared `help` runtime for contextual documentation.
- Do not create module-specific help drawers, documentation modals or knowledge-base navigation.
- Every user-facing module page should have at least one route-associated Help article.
- Use `help.open(articleId)` for field/workflow-specific assistance.
- Keep developer documentation in repository `docs/`; keep end-user operational guidance in the Help article contract.

See `docs/module-help.md`.
