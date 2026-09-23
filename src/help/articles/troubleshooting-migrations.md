# Migration drift

Migration drift means a Django model definition no longer exactly matches the migrations committed with Core or a module.

For Core, `tec_tac` drift is treated as a failure because Framework releases must include every required migration.

For installed modules, drift is shown as a warning and identifies the affected Django app, proposed migration name and operations. The owning module should ship that migration in its next package.

Do not use `makemigrations` directly on production as the permanent fix. A production-generated migration sits outside the versioned module lifecycle and can make later upgrades inconsistent.

After corrected Core/module releases are installed, this command should report `No changes detected`:

```bash
cd /rmm/api/tacticalrmm
/rmm/api/env/bin/python manage.py makemigrations --check --dry-run
```
