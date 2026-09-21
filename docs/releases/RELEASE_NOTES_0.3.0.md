# Tec-Tac UI 0.3.0

## System → Updates

0.3.0 adds a dedicated **System Updates** workspace for Tec-Tac framework and UI maintenance.

Operators with Tactical server-maintenance permission can:

- view installed framework/UI versions and configured repositories;
- check the latest stable GitHub release;
- download and inspect a stable release before installation;
- explicitly unlock advanced branch sources for the current browser session;
- select repository branches/custom builds and stage the exact resolved commit;
- upload offline `.zip`, `.tar.gz`, or `.tgz` repository archives;
- inspect component, installed/package version, operation, source and SHA256 before installation;
- explicitly confirm downgrades;
- follow durable lifecycle stages and log output;
- see rollback status on failures;
- reload into the new UI only after a UI update completes;
- review recent update history and provenance.

Tec-Tac Framework 1.3.0 or newer is required for this page.

## Navigation categories

The left rail now renders navigation by category instead of one flat list. Core administration pages (`Modules`, `Access`, `System Updates`) live under **Administration**, while normal product pages remain under **Workspace** and extension modules use their declared navigation section (normally **Extensions**). The shell recognises **Configuration** as a first-class category for future settings pages without showing empty headings.

This keeps operational, administrative and configuration surfaces separate as Tec-Tac grows into a broader Tactical replacement UI.
