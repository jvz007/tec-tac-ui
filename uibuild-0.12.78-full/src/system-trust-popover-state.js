export function trustPopoverOpen(state, key) {
  return state?.hover === key || state?.focus === key
}

export function trustPopoverTransition(state = {}, channel, key = null) {
  const next = { hover: state.hover ?? null, focus: state.focus ?? null }
  if (channel === 'close') return { hover: null, focus: null }
  if (channel === 'hover' || channel === 'focus') {
    next[channel] = key
    return next
  }
  throw new Error(`Unsupported trust popover transition: ${channel}`)
}

export function trustPopoverDomId(key) {
  return `system-trust-popover-${String(key).replace(/[^a-z0-9_-]+/gi, '-')}`
}
