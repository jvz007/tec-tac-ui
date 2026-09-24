# Tec-Tac UI 0.12.13

## Stable update signing indicator

- System Updates now shows a **Release trust** row on each Framework/UI stable-release card.
- A stable release whose trusted manifest signature was verified by Core is shown as `SIGNED` before download.
- Unsigned releases remain explicit, while incomplete, invalid, or untrusted signing metadata is shown as an error state rather than silently falling back.
- Hovering or keyboard-focusing the trust badge shows publisher, key, algorithm, manifest file count, and the verification detail.
- The staged package continues to use `VERIFIED` only after Core has validated the complete downloaded source tree.
