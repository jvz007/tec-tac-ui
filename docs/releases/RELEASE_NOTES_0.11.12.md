# Tec-Tac UI 0.11.12

## Module package inspection grid

- Reworks Module Manager package inspection into a compact per-module grid modeled on System Updates.
- Shows each staged module's installed version, target package version, install/replace action, source, SHA256 and hard dependencies before installation.
- Preserves multi-package and bundle support, dependency planning, drag/reorder install sequencing and blocking-problem handling.
- Batch inspection now retains package provenance metadata for each displayed module, including source filename and available artifact hash.
