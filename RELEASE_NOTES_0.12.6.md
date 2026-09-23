# Tec-Tac UI 0.12.6

## Core notification toast surface fix

- Core-owned toast cards now use the existing opaque `--surface` theme token instead of the undefined legacy `--panel` token.
- Toast borders and nested action/marker borders now use the existing `--line` token.
- Success and warning left-edge semantics use the existing `--ok` and `--warn` tokens; info and error continue to use `--accent` and `--danger`.
- No new theme token was introduced. The fix therefore follows the existing Dark, Light and High Contrast theme definitions.
- Toast size, placement, shadow, actions, dismiss behavior and Core notification runtime behavior are unchanged.
- Sticky/action notifications such as minimized workflow restore controls now render on a solid surface over busy page content.
