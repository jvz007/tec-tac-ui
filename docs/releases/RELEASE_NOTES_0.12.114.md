# UI 0.12.114

Date: 16 October 2026. Requires Core 1.17.48 or later (raised from 1.17.46, the newest signed Core on dev). This release adds new tokens, a new opt-in style scope and four shared components. **Nothing in this release was tested on the dev server.** The checks below ran in node and in the build only, so how it looks in Dark, Light and High contrast is not yet confirmed.

## What changes for you

- **Toast corners are 3px.** Notification cards used 10px corners and now match panels. The toast action button goes from 6px to 2px, to match controls. Nothing else about toasts changes. Every module that raises a toast through `context.notifications` shows the new corners.
- **No other screen changes.** Core pages keep 15.5px text, and the sign-in and setup pages keep their 11.6px labels. Existing module screens look the same, because the new work-surface style is opt-in.
- **Module dialogs use the denser work-surface style.** The panel of `context.dialogs` now carries `tt-ws` (see below), so tables, labels, inputs and buttons inside a module dialog use 12.1px text and tighter spacing.

## What modules can use

- **Size, density and radius tokens** in `:root`: `--text-body`, `--text-ws`, `--text-sm`, `--text-xs`, `--cell-y`, `--cell-x`, `--ctl-y`, `--ctl-x`, `--radius-control`, `--radius-panel` and `--label-track-ws`. Text sizes are scaled by the text-size setting. `--label`, `--label-track` and `--font-scale` keep their values.
- **`tt-ws`, the work-surface scope.** Add the class to your own markup and its tables, `.field` labels, inputs, selects, textareas and buttons take the board's density. Add it at your next release. The shell does not add it to the routed page, so nothing changes until you do.
- **Four shared components** in `context.components`: `DataTable` (P1), `FormRow` (P3), `EditorWindow` (P2) and `Stepper` (P5). Props, events and limits are in `docs/module-components.md`. They draw text only. None of them confirms or discards: when a person closes an unsaved editor, you ask one plain Yes or No through `context.confirm`.
- **`SearchSelect` has three new optional props:** `required` (`aria-required`), `invalid` (`aria-invalid` and the invalid border) and `describedBy` (`aria-describedby`). Nothing changes when you leave them out. This answers the request from agents 0.11.3.
- `registerPublic(context)` still gets no components.
- The docs: `docs/ui-design-standards.md` has the built state in section 22 and new sections 23 (tokens and scope) and 24 (the kit). `docs/module-runtime-api.md` carries one contract-row note. The Core export does not list the new rows yet, and this note does not say it does.

## Check it worked

```bash
cd workspace/ui && npm test && npm run build
```

Both should finish without an error. On a dev server, open a module dialog and a toast, and check the corners and the text size. That check was not run for this release.

## What is left before 0.13.0

Johan's plan (Q57): when the theme work is tested and working, UI goes to 0.13.0 and Core to 1.18.0 together. Still to do:

1. Test the theme system on the dev server in Dark, Light and High contrast, with screenshots (headless Edge, as the board README describes).
2. Script Manager and Report Manager move onto the kit in their own releases (Q62 is open, and the module owners decide the dates).
3. The Core contract rows for the kit, the tokens and `tt-ws` go in Core 1.18.0.
4. Johan decides whether the shell applies `tt-ws` to every module route automatically.
5. Then the 0.13.0 UI and 1.18.0 Core bump, together.

## Checks

`tests/theme-tokens-0.12.114.mjs` covers the tokens, the unchanged old tokens, the scaled sizes, the `tt-ws` rules, the byte-identical base rules, the toast corners and a scan of `modules/` for a clash with the new class names. `tests/shared-kit-0.12.114.mjs` renders the four components and drives their events. `tests/shared-select-aria-0.12.114.mjs` covers the three new props. `tests/theme-docs-0.12.114.mjs` checks the docs. `tests/core-requirement-0.12.114.mjs` replaces the 0.12.113 test, which pinned that version. `tests/foundation.sh` now expects the 3px toast corner. No dev server, no browser screenshot and no real module was run.

## Left out, and why

- **Script Manager and Report Manager on the kit.** Johan asked what Q62 means, so it has no answer yet. Script Manager is core-module work. Nothing is built or requested for it until he answers.
- **`tt-ws` on every module route.** It would restyle every module screen at once. It is opt-in now, and Johan decides whether that changes at 0.13.0.
- **Fixed-px module text following the text-size setting.** A module fixes this by adopting the `--text-*` tokens at its own release. There is no safe way to do it from the shell.
- **Swappable themes (MSP branding).** The board says not now. The tokens only make it possible later.
- **SearchSelect opening behaviour (Q63) and TagEditor commas (Q64).** Both stay as they are until Johan answers.
- **Scheduler event jobs panel (request from Core 1.17.45) and `correlationId` on `context.tacticalOperation` (from checks 0.16.1).** Separate work. The second needs a Core change first.
- **The Core export rows.** They are a request to Core (`reviews/requests/core.md`), for Core 1.18.0.
- **The 0.12.113 notes in `docs/releases/`.** They replace an earlier copy of the same file there. The earlier text stays in git history.
