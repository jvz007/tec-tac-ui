# Tec-Tac UI 0.12.5

## RBAC permission editor workflow

- Groups extension permissions by owning module rather than repeating package permission-group labels as separate cards.
- Deduplicates extension permission totals where the same permission appears in more than one declared permission group.
- Uses compact one-line module permission labels such as `read — agent-management`, with the full permission code retained as hover detail.
- Adds **Expand all** and **Collapse all** controls to Tactical and extension permission workspaces.
- Renders the two permission columns as independent vertical stacks so collapsing a card in one column does not reserve matching row height in the other column.
- Increases the sticky role action-bar status text for normal long-session readability.

No Framework change is required.
