// Keyboard rule for a dialog tab strip (0.12.100, docs/ui-design-standards.md section 8.2). Arrow keys move between tabs and
// wrap at the ends; Home and End jump to the first and last tab. Returns the new index, or -1 when the key is not a tab key.
export function nextTabIndex(current, count, key) {
  if (!Number.isInteger(count) || count < 1) return -1
  const index = Number.isInteger(current) && current >= 0 && current < count ? current : 0
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return -1
}
