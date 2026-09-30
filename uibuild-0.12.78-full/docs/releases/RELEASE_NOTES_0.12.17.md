# Tec-Tac UI 0.12.17

## Signed source release preflight

- Added `scripts/preflight-signing-tree.sh` for publisher/release workflows.
- Signing preflight fails closed when generated `node_modules`, `dist`, or `.vite` trees are present.
- Signing preflight rejects symlinks and other special files before a release is signed, matching Core signed-tree rules.
- GitHub release workflow now runs the signing-tree preflight before installing Node dependencies.
- Core verification remains unchanged: signed release execution trees still permit regular files/directories only.

This prevents a built development workspace (for example `node_modules/.bin/rollup`) from becoming part of a signed source release.
