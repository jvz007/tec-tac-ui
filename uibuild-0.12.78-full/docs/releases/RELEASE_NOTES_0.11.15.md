# Tec-Tac UI 0.11.15

## Managed module hotfixes

Module Manager adds a **Hotfixes** workspace for Framework 1.15.25's managed module hotfix lifecycle.

Operators with Module Manager permission can:

- upload and inspect a managed hotfix ZIP;
- review module ID, hotfix ID, exact base version, changed files and before/after SHA-256 values;
- apply a staged hotfix and follow its lifecycle job;
- select an installed module and review currently applied hotfixes;
- roll back the newest applied hotfix.

The UI does not interpret or apply patch content itself. Framework/Core remains authoritative for path containment, version/hash validation, backup, privileged file replacement, validation, runtime reload/synchronization and rollback.

Route/favorites Quick Actions behavior from 0.11.14 is unchanged.
