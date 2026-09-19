# Tec-Tac UI 0.10.3

## Installation layout integration

- UI source checkout moves to `/opt/tec-tac-src/ui`.
- Compiled UI remains at `/var/lib/tec-tac/ui/tec-tac`.
- UI install, nginx repair and module synchronization read `/opt/tec-tac/etc/tec-tac.conf`.
- Module synchronization now refuses to publish an apparently empty module catalog when enabled module state references missing extension files.
