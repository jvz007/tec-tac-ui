# Tec-Tac UI 0.12.30

## System Updates trust popover focus behaviour

- Fixed the System Updates signature/trust details popover remaining visible after mouse interaction moved away from the trust badge.
- The popover now opens on pointer hover or keyboard `:focus-visible` only.
- Removed ordinary `:focus` and `:focus-within` activation so a mouse click does not pin the trust details open.
- Keyboard users can still reveal the same publisher, key, algorithm and verified-file details by tabbing to the trust badge.
