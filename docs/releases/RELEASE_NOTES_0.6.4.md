# Tec-Tac UI 0.6.4

## Module UI load diagnostics

- Modules now shows the authenticated UI runtime result for each installed module: loaded, failed, skipped, disabled, public only, none, or not reported.
- Import/register failures are surfaced directly in the Modules workspace instead of silently presenting as a missing navigation entry.
- Selecting a failed module shows the browser-side error returned by the dynamic module loader.
- A page-level failure summary appears when one or more authenticated module UIs failed during bootstrap.
- Runtime enablement and navigation visibility remain independent from UI load health.

Framework requirement remains Tec-Tac Framework >=1.6.1,<2.0.0.
