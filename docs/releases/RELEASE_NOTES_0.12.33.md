# Tec-Tac UI 0.12.33

Release-pipeline supply-chain hardening. Runtime UI behaviour is unchanged from 0.12.32.

- Commit an npm v3 `package-lock.json` aligned with the pinned UI dependency versions.
- Release workflow now installs dependencies with `npm ci` instead of `npm install --no-package-lock`.
- Pin `actions/checkout` and `actions/setup-node` to immutable commit SHAs while retaining their v4 annotations.
- Add regression coverage for lock/package alignment and workflow pinning.
