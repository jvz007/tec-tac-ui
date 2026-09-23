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

Purpose: ask the user to confirm an action.

Examples: delete a schedule, remove an assignment, run an immediate action.

Structure:

```html
<div class="modal-backdrop">
  <div class="modal-panel">
    <div class="cardhead">...</div>
    <p>Explain the consequence.</p>
    <div class="modal-actions">
      <button class="btn">Cancel</button>
      <button class="btn danger">Delete</button>
    </div>
  </div>
</div>
```

Rules:

- No form fields for a normal confirmation.
- Use typed confirmation only for genuinely dangerous/high-impact actions.
- The safest action is visually neutral; the consequential action carries primary/warning/danger styling as appropriate.
- Do not use `window.alert`, `window.confirm` or `window.prompt` in modules.

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
.modal-backdrop
.modal-panel
.subtabs
.field
.pill
```

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
