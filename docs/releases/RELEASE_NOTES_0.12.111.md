# UI 0.12.111

Date: 15 October 2026. Requires Core 1.17.41 or later (raised from 1.17.39, the Core release this UI was built and tested against).

Patterns: P6 (script and report picker) and P7 (argument entry) from the brand board, `docs/ui-brand-board/`.

## What changes for you

- **The Online catalog tab says why it is empty.** Core 1.17.41 sends a plain sentence with the catalog. When the tab has nothing to list, it shows that sentence, for example that no repository is set up, that a repository has not synced yet, or that the last sync failed. A warning colour marks those three cases. When some modules are listed, a small line above the table shows "N of M repositories synced".
- **A search that finds nothing says so.** The tab shows "No modules match your search." and never Core's sentence for that case.
- **Modules installed here but in no repository are listed apart.** Under the table, a quiet note headed "Installed here, not in any repository" lists each one with its id, version and source (a dash when Core does not send them). The rows have no buttons, are not counted in the tab counter and are not touched by the search box. The counter and the updates count still read the modules a repository offers. Download, Reinstall and Download update follow the same rules as before.
- **An older Core still works.** A Core before 1.17.41 sends neither the sentence nor the note, so the tab looks and behaves as it did.
- **No other screen changes.** Nothing is restyled.

## For module developers

- **Two shared components, `context.components.SearchSelect` and `context.components.TagEditor`.** They are the board's P6 picker and P7 tag editor, built with render functions (`context.Vue.h(SearchSelect, props)`), so a module needs no template compiler.
  - `SearchSelect` props: `modelValue`, `options` (`value`, `label`, `description`, `favourite`, `chip`, `chipTone`, `disabled`, `searchText`), `placeholder`, `inputId`, `ariaLabel`, `disabled`, `clearable`, `emptyText`, `favouriteLabel`, `allLabel`. Events: `update:modelValue` and `select(option)`, so a module can fill default arguments and a timeout when a script is chosen. One combo box with the roles and ARIA attributes of the board, a search over label, description and extra search text, Favourites first, then the rest, a list capped at 300 rows, and the keys of the behaviour table (Escape closes the list and stops there, so it does not close an enclosing popup).
  - `TagEditor` props: `modelValue` (an array of strings), `placeholder`, `ariaLabel`, `disabled`, `readonly`, `maxItems` (200), `maxLength` (500), `commaAdds` (true), `validate`. Events: `update:modelValue` and `reject({ value, reason })`. Enter or a comma adds, Backspace in an empty box removes the last value, leaving the box adds what was typed, values are trimmed, duplicates and empty values are ignored, control characters are stripped, and every value is a text node shown in the mono font.
  - The list is placed from the input's position with `position: fixed`, so a scrolling dialog such as `.modal-wide` does not cut it off.
  - The rules live in `src/shared-components-logic.js` (pure and tested in node); the components in `src/shared-components.js` only draw.
  - Styles: one commented block in `src/styles.css` with `.tt-combo`, `.tt-input`, `.tt-star`, `.tt-chip`, `.tt-tagbox`, `.tt-tag`, `.tt-field`, `.tt-help` and `.tt-error`. It uses the existing tokens only. One fix against the board's CSS: the board's field rule matched every input under `.tt-field`, which would give a tag editor's input a border. Here it names direct children only.
  - Public pages (`registerPublic`) do not get the components. The contract row `ui.authenticated.components` is written in `docs/module-runtime-api.md` as "not yet in the export"; Core writes the export row (`reviews/requests/core.md`).
  - **Modules adopt them at their next release.** Nobody rebuilds only for this. Documents: `docs/module-components.md`, a section in `docs/module-runtime-api.md`, section 22 and a pointer in section 17 of `docs/ui-design-standards.md`.
- **A host abort of a grid column settles at once.** `loadGridColumns` with an aborted `signal` now settles that column as `failed` straight away, aborts the loader's signal and clears its timer. A late answer from the module is ignored. Before, a host abort showed as `timeout` and only after the full time limit. A real time-limit hit still gives `timeout`; the three statuses are unchanged. Endpoints 0.7.0 is the only caller and already discards results of an aborted call, so what it shows does not change. This closes the held finding from the ui-0.12.93 review.

## Screenshots

The two components were drawn in a scratch page with Core's real stylesheet and photographed with headless Edge in dark, light and high contrast (list open, a chosen item with the clear button, a tag editor with three values, a read-only one). All three looked right. The keyboard and mouse behaviour was not clicked through in a browser; it is covered by the tests of the pure rules and by server-side rendering of both components.

## Housekeeping

- The 0.12.110 release notes moved to `docs/releases/`.
- Q56 is closed: the built behaviour (option a, each caller gets a value of its own kind) stays as shipped in 0.12.109.
- A second assumption from that entry still holds: a `recommended` value of `false` on an online catalog row shows "not recommended" only when Core sends an explicit `false`; `null` shows nothing.
- About 20 older tests pinned the exact Core requirement `>=1.17.39,<2.0.0`. They now accept any `>=1.17.N,<2.0.0`, so the next raise does not break them.

## Not built

- No theme size, density or radius tokens and no wider component kit (table, form row, editor window, stepper): Johan has not answered Q57. No existing screen is restyled and the toast corners stay as they are (Q58 to Q62).
- The refused-module display for the production gate (AD-21 condition 6) and the AD-37 UI wait for Johan.

## Open questions for Johan

- Q63: when a picker that already has a chosen item gets focus, the list shows every item with the chosen one highlighted (the board filters by the chosen name). It is one line in `comboKey` to switch.
- Q64: `TagEditor` has a `commaAdds` prop (default true as on the board), so a value such as `-Names "a,b"` can keep its comma.

## Tests added or changed

- New: `core-requirement-0.12.111.mjs`, `online-catalog-availability-0.12.111.mjs`, `shared-select-tags-0.12.111.mjs`, `shared-components-docs-0.12.111.mjs`, `grid-columns-host-abort-0.12.111.mjs`.
- Changed: `core-requirement-0.12.109.mjs` expects a 1.17 requirement, not 1.17.39, and the 0.12.110 notes in the archive. `module-preferences-docs-0.12.106.mjs` reads the version from `VERSION` and the 0.12.110 notes from the archive.
- Changed: 19 more tests accept any `>=1.17.N,<2.0.0` Core requirement.

## Agent checklist (brand board README)

1. Read the board before touching a screen. Name the pattern (P1 to P10) in the release notes: here P6 and P7.
2. No hex colours and no raw `px` font sizes. Colours are `var(--token)`; sizes are `calc(Npx * var(--font-scale))` or `var(--label)`.
3. If no pattern fits, write a request. Do not invent one.
4. Screenshot the screen in dark, light and high contrast before calling it done: done for the two components (see Screenshots).
5. Where the board marks a Decision (D1 to D5), use its recommended value until Johan answers.
