# Fixing — UI 0.12.52

This release prevents stale dashboard list requests from committing after a newer refresh or after the view unmounts. Dashboard loading must remain guarded by the shared latest-request generation mechanism.

Regression: `tests/ui-0.12.52.mjs`.
