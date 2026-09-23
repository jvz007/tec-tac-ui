# Tec-Tac UI 0.12.1

## Scheduler workspace

The Core Scheduler operational page has been refreshed around two clear working views: configured schedules and run history. Both views now have compact filtering, summary metrics, consistent empty states, clearer timing labels, a closeable side editor, and Core-styled confirmation dialogs instead of a native browser delete prompt.

Scheduler configuration, runtime health and self-tests no longer load on the operational Schedules page. The supplied page-load HAR showed the old Schedules route performing additional Scheduler configuration and health requests even when the operator remained on the operational view. Those administrative calls now occur only on the dedicated Scheduler Configuration page.

## Scheduler administration

`Scheduler Configuration` is now a separate Core route at `/system/scheduler` under Administration. It contains retention settings, runtime health, diagnostics and Scheduler self-tests.

## UI design contract

`docs/ui-design-standards.md` is now the canonical look-and-feel contract for Core and module UIs. It defines page structure, tabs, buttons, tables, status pills, forms, confirmation vs input/action vs data-display dialogs, notices, loading/empty/error states, search, navigation, accessibility and module CSS boundaries.

New module UIs must use Core primitives rather than shipping competing button, table, modal, toast or typography systems.
