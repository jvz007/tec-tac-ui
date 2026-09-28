# Tec-Tac UI 0.12.32

## System Updates trust popover

- Replaced CSS pseudo-class visibility for release trust details with explicit Vue pointer/focus state.
- Trust details are now rendered only while the VERIFIED/SIGNED trigger is actively hovered or keyboard-focused.
- The popover itself remains pointer-inert and cannot keep its own visibility alive.
- Added regression coverage to prevent CSS hover/focus visibility selectors from returning.
