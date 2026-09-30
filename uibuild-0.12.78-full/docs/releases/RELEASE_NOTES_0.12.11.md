# Tec-Tac UI 0.12.11

## Module package trust review

- Replaces the large Package Trust card with a compact Trust column in the package inspection row.
- Verified packages are shown as `SIGNED`; unsigned normal packages remain explicitly supported and are shown as `UNSIGNED`.
- Hovering or keyboard-focusing the trust badge opens a larger detail popover with publisher identity, key ID, algorithm, environment, package SHA-256, and publisher permissions.
- Invalid or untrusted states retain their Core-reported trust label and detail without consuming permanent page space.
- No module URLs, API paths, install behavior, signing policy, or permission rules changed in this UI release.
