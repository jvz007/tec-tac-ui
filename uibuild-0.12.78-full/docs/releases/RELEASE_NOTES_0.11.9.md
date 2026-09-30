# Tec-Tac UI 0.11.9

## Lifecycle hardening

- Enabled state entries whose extension files are already gone are reported as warnings and skipped during UI synchronization instead of blocking the entire UI update/rollback.
- The installer now assembles and synchronizes a staged UI tree before backing up or replacing the live UI, so extension-UI validation failures happen before cutover.
- Failed System Update jobs surface their final lifecycle lines prominently in addition to the full log tail.

## Module package inspection

- Module package/bundle/batch inspection now mirrors the System Updates summary pattern.
- The preview shows artifact identity, package count, source and SHA256 before install.
- Existing dependency resolution, current → target versions, action badges, blockers and reorder rules remain authoritative and unchanged.
