# Tec-Tac UI 0.12.47

## Review closure

- L64: all three reviewed clipboard surfaces now use a shared feedback helper that turns unavailable/rejected clipboard writes into deterministic user-facing error state.
- L68: System Update trust popover hover/focus/close transitions are now driven by a tested state helper while retaining aria-describedby, tooltip semantics, click close and Escape close.
- L69: client changes and the synthetic site-search reset now use a tested reload gate so one client change produces one immediate site load.
- L72: Scheduler history page fallback is handled by a tested async loader that re-requests the last valid page when the current page disappears.
- L73: Scheduler history loading returns its own error result and the view writes only historyError, keeping unrelated Scheduler errors isolated.

## Tests

- Added `tests/ui-partial-closure-0.12.47.mjs` and `tests/ui-partial-closure-0.12.47.sh`.
