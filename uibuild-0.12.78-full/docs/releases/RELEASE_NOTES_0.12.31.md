# Tec-Tac UI 0.12.31

## System Updates trust popover hover correction

- Corrected the System Updates release/package trust popover so only the actual trust pill is the hover target.
- The popover is now a non-interactive sibling with `pointer-events: none`, so moving the pointer over the popover itself cannot keep it open.
- Keyboard accessibility is retained through `:focus-visible` on the trust pill.
- Added regression coverage preventing wrapper-hover/focus behaviour from returning.
