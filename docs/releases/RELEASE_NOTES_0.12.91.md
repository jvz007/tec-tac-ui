# UI 0.12.91

Released 9 October 2026. Requires Core 1.17.13 or later.

## What changes for you

- **Modules shows each module's category.** There is a new **Category** column and a line in the module panel. The categories are Core (wraps one part of Tactical RMM's API), Server (looks after the server itself), Premium (adds what Tactical RMM does not have) and Test (for development). A module that states no category shows **Not stated, treated as Test**, in amber.
- **Filter by category.** A list next to the search box shows All categories, Core, Server, Premium, Test or Not stated. Test lists only modules that declare Test. **Not stated** finds the modules that still need a category in their next release. The search box also matches the category name.
- **Core's own warning is shown as Core sent it.** The module panel shows it under the details, so the wording stays Core's. If the category recorded at install differs from the one in the module's manifest, a plain line says Core uses the manifest.
- **An empty second confirmation no longer loops.** If Core asks for a second confirmation but names no module to switch off, the dialog closes, the page shows Core's own explanation (or a plain sentence) and the list reloads. Before, you went back to step one and the same refusal could repeat.
- **Older Cores.** A module row without category fields shows no badge and is never guessed at.

## For module authors

- **`tacticalOperation` takes `query` and `file`.** Both are optional. `query` is a flat object of at most 16 names. Each value is a string or a whole number of at most 512 characters. `file` is a `File`, or a `Blob` with a name. With a file the helper sends `multipart/form-data`: the text parts `params`, `body` and `query` (only if you pass it), then one file part named after the file with the same filename. The browser writes the boundary. Core's refusal codes (`query_field_not_allowed`, `invalid_query`, `upload_not_allowed`, `upload_too_large`, `upload_type_not_allowed`, `invalid_upload`) arrive as `error.code`. Needs Core 1.17.13.
- **A call written for 0.12.90 sends the same bytes.** Without `query` and `file`, the body is still exactly `{ params, body }` as JSON.
- **A file named `params`, `body` or `query` is refused locally,** because those are the text parts. Rename the file.
- Checked against `modules/`: Agents, Licensing and Reports Manager use `tacticalOperation` without these options and keep working. No module reads the Modules catalogue rows, so the badge and filter touch none.

## Contract documents

The newest export is `docs/contracts/tec-tac-public-contract 1.17.13-0.12.90.md`. Its development rules (line 14) carry the hand-back flow, `disable_replaced` and `confirm_replacement_switch`. The exported file carries the browser rows and the rules. It does not carry the HTTP route field tables. `second_confirmation_required`, `will_enable`, the refusal code `replacement_second_confirmation_required`, `enabled_modules` and `reconciled_modules` are named only in Core's `contracts.py`. That gap is a request to Core.

## Requirements

Core 1.17.13 or later. The package now requires `tec-tac-framework >=1.17.13,<2.0.0`. The category fields and the query and upload support exist only from Core 1.17.13.

## What is not built

- **The production gate** (showing a module with no category as refused). It waits for Johan to name the release. Until then a missing category reads "treated as Test", with Core's warning.
- **The warning dialog for disabling a replacement whose replaced module cannot return, and the failure toasts.** These are 0.12.92, after Core 1.17.14.
- **A fixed upload field name.** The file part is always named after the file. An operation that declares a fixed field is not covered yet (question Q17).
- **Category on staged package rows and the Install dialog.** Core already says why a package cannot install.

## Under the hood

- `src/module-category.js` (new, pure, import-free): `categoryBadge`, `categoryFilterKey`, `CATEGORY_FILTERS`, `filterByCategory`, `categoryNote`, `categorySearchText`.
- `src/views/ModulesView.vue`: Category column, category select, module panel badge and notes (mustache text only, no `v-html`), the empty second-confirmation path in `handleEnableRefusal`.
- `src/module-replacement.js`: `emptySecondConfirmationText`. `secondConfirmationRequiredPayload` keeps its shape.
- `src/tactical-operations.js`: `query` and `file` options. `src/module-loader.js` passes options through untouched.
- Docs: `docs/module-runtime-api.md` (tacticalOperation section), `src/help/articles/modules.md` (Category).
- Tests: `tests/module-category-0.12.91.mjs`, `tests/tactical-operations-query-file-0.12.91.mjs`, `tests/module-replacement-second-empty-0.12.91.mjs`. Earlier tests now expect Core `>=1.17.13`.
