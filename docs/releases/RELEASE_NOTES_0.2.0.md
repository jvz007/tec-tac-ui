# Tec-Tac UI 0.2.0

## Module discovery and lifecycle

- Replaces the placeholder Modules page with an installed module catalog.
- Shows extension, ReportSet, optional runtime UI, Django-app, permission, protected/reference, and legacy status.
- Uploads `.zip`, `.tar.gz`, or `.tgz` packages to backend 1.2.0 for inspection before installation.
- Shows current vs package versions for replacements and requires explicit replacement confirmation.
- Blocks package installation when extension and ReportSet versions are not aligned.
- Queues install/replace/removal jobs and polls across Tactical service restarts.
- Shows lifecycle log tail and transient restart state.
- Reload action loads newly synchronized runtime UI modules after success.
- Removal preserves module database objects/data; destructive data purge is intentionally not exposed in this UI release.
- Installation/removal controls require Tactical `can_do_server_maint` or effective superuser.
- Package dialogs explicitly identify modules as trusted server/browser code.

## RBAC quality-of-life

The floating role action bar now keeps role context visible while scrolling:

- role name
- role ID
- SAVED / UNSAVED state
- Save role & permissions
- Delete role

## Pairing

Use with Tec-Tac backend/framework 1.2.0.
