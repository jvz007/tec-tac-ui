# Tec-Tac UI 0.10.5

## Clean source checkout builds

- UI installation now runs `npm install --no-package-lock`, preventing installs from creating an untracked `package-lock.json` inside `/opt/tec-tac-src/ui`.
- This keeps the UI source checkout clean for Framework 1.13.2 System Update preflight and rollback guarantees.
- No UI behavior or navigation functionality changes in this release.
