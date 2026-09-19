# Tec-Tac UI 0.10.2

UI release-integrity and version-display cleanup.

## Login version consistency

- Removes the stale hardcoded `UI 0.3.0` value from the authentication/enrollment screen.
- Uses the same Vite-injected `__TEC_TAC_UI_VERSION__` source already used by the authenticated shell footer.
- Adds regression checks preventing the login screen from drifting away from the installed UI version again.

## Release integrity

- Foundation tests now validate VERSION, `package.json`, and `tec_tac_package.json` against each other instead of embedding the release number in multiple places.
- Adds release-integrity regression coverage for metadata and current release-note placement.
- Restores the documentation convention that historical release notes live under `docs/releases/` and only the current release note remains at repository root.

No navigation, Scheduler, RBAC, module visibility, or module runtime behavior changes are included.
