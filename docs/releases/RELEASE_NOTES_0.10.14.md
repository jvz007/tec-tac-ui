# Tec-Tac UI 0.10.14

## Module update version preview

Module package and bundle inspection now shows the installed version and target package version before installation, matching the System Updates workflow.

Examples:

- existing module update: `0.10.12 → 0.10.13`
- first install: `not installed → 0.10.13`

The values come from the Framework Module Management v2 install plan (`current_version` and `version`), so the UI uses the authoritative installed state rather than inferring versions locally.
