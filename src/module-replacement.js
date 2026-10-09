// Plain-English replacement state for the Modules page (AD-20, Core 1.17.9 and 1.17.10).
// Import-free and pure: it reads the rows of GET /api/tfd/modules/v2/ and returns text.
// A missing, null or wrongly typed field shows nothing (an older Core never sends them).

const REASON_TEXT = {
  'replacement-disabled': 'The replacement is switched off, so the core module keeps its routes and contracts.',
  'target-missing': 'The core module it replaces is not installed.',
  'target-not-core': 'The module it points at is not a core or server module, so it cannot be replaced.',
  'target-enabled': 'Both modules are enabled. Core never runs both, so it keeps the module being replaced and does not run the replacement.',
  'competing-replacement': 'Another enabled module also replaces this core module. Only one can be active.',
  'capabilities-undeclared': 'The core module does not list its capabilities, so Core cannot check that the replacement covers them.',
  'capability-missing': 'The replacement does not offer every capability of the core module.',
  'capability-major-mismatch': 'The replacement offers a capability at a different major version.',
  'capability-version-lower': 'The replacement offers a capability at a lower version.',
}

const CAPABILITY_REASON_TEXT = {
  'capability-missing': 'not offered by the replacement',
  'capability-major-mismatch': 'a different major version',
  'capability-version-lower': 'a lower version',
}

const MISMATCH_REASON_TEXT = {
  'capability-major-mismatch': 'a different major version',
  'capability-version-lower': 'a lower version',
}

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')
const list = (value) => (Array.isArray(value) ? value : [])
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null)
const ids = (value) => list(value).map(text).filter(Boolean)

// Both modules were enabled (Core 1.17.11): Core keeps the replaced module and switches the replacement off.
export function conflictLine(row) {
  const replacement = text(row?.id) || 'the replacement'
  const replaced = text(row?.replaces) || 'the other module'
  return `Both were enabled. Core kept ${replaced} and is switching ${replacement} off.`
}

// A hard dependency that an honoured replacement stands in for (Core 1.17.11).
export function satisfiedByLine(dependency) {
  const by = text(dependency?.satisfied_by)
  if (!by) return ''
  const id = text(dependency?.id)
  return id ? `met by ${by} (it replaces ${id})` : `met by ${by}`
}

// The module ids a row or plan says it will switch off. Anything but an array
// of non-empty strings shows nothing, so an older Core changes nothing.
export function willDisableIds(value) {
  const out = []
  for (const item of list(value)) {
    const id = text(item)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

function nameList(names) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// The notice shown before enabling `moduleId` switches other modules off.
export function replacementConfirmLines(moduleId, willDisable) {
  const names = willDisableIds(willDisable)
  const who = text(moduleId) || 'This module'
  if (!names.length) return []
  const many = names.length > 1
  return [
    `Enabling ${who} will switch off ${nameList(names)}.`,
    `${many ? 'They stay' : `${names[0]} stays`} installed.`,
    `${who} takes over ${many ? 'their' : 'its'} routes and contracts.`,
    `You can switch ${many ? 'them' : names[0]} back on later by disabling ${who} first.`,
  ]
}

// What an inspected install plan will switch off: the plan's list, plus which
// package switches off which module. { ids, lines }
export function installConfirmSummary(plan) {
  const ids = willDisableIds(plan?.will_disable)
  const perAction = []
  for (const action of list(plan?.actions)) {
    const names = willDisableIds(action?.will_disable)
    for (const name of names) if (!ids.includes(name)) ids.push(name)
    const id = text(action?.id)
    if (names.length) perAction.push({ id, names })
  }
  const lines = []
  if (ids.length) {
    lines.push(`This install will switch off ${nameList(ids)}.`)
    for (const item of perAction) {
      lines.push(item.id ? `${item.id} switches off ${nameList(item.names)}.` : `A package switches off ${nameList(item.names)}.`)
    }
    lines.push(`${ids.length > 1 ? 'They stay' : `${ids[0]} stays`} installed. The new module takes over ${ids.length > 1 ? 'their' : 'its'} routes and contracts.`)
    lines.push('You can switch the old modules back on later by disabling the new ones first.')
  }
  return { ids, lines }
}

// For a failed request: the fresh list when Core refused because the list the
// user saw is out of date (HTTP 400, code replacement_confirmation_required),
// else null so the ordinary error path keeps handling it.
export function confirmationRequired(error) {
  if (!error || error.status !== 400) return null
  const payload = object(error.payload)
  const code = text(payload?.code) || text(error.code)
  if (code !== 'replacement_confirmation_required') return null
  return willDisableIds(payload?.will_disable)
}

export function replacementListChangedText(fresh) {
  const names = willDisableIds(fresh)
  return names.length
    ? `The list changed while you were reading it. It now switches off ${nameList(names)}. Check it and confirm again.`
    : 'The list changed while you were reading it. Nothing needs switching off now. You can confirm without a list.'
}

export function replacesLabel(row) {
  const id = text(row?.replaces)
  return id ? `replaces ${id}` : ''
}

export function replacedByLabel(row) {
  const id = text(row?.replaced_by)
  return id ? `replaced by ${id}` : ''
}

function failedCapabilityLine(item) {
  const name = text(item?.capability)
  if (!name) return ''
  const reason = CAPABILITY_REASON_TEXT[item?.reason]
  const needs = text(item?.required)
  const has = text(item?.declared)
  const detail = [needs ? `the core module has ${needs}` : '', has ? `the replacement declares ${has}` : 'the replacement declares nothing for it'].filter(Boolean).join(', ')
  return `${name}: ${reason || 'does not match the core module'} (${detail}).`
}

export function registeredMismatchText(item) {
  const capability = text(item?.capability)
  if (!capability) return ''
  const registered = text(item?.registered) || 'an unknown version'
  const declared = text(item?.declared) || 'another version'
  const why = MISMATCH_REASON_TEXT[item?.reason]
  return `The replacement registered ${capability} at version ${registered}, but it declares ${declared}.${why ? ` That is ${why}.` : ''} Core did not accept it, so that capability is unavailable until the module is fixed and Tec-Tac restarts.`
}

// { badge, tone, lines[] } for one module row. badge '' means nothing to show.
export function replacementSummary(row) {
  const lines = []
  let badge = ''
  let tone = ''
  const replaces = text(row?.replaces)
  const replacedBy = text(row?.replaced_by)
  const status = object(row?.replacement)

  if (replaces) {
    lines.push(`Replaces ${replaces}.`)
    if (status) {
      if (status.honoured === true) {
        badge = 'active replacement'
        tone = 'ok'
        lines.push(`Active. This module is the active replacement and owns ${replaces}'s routes and contracts.`)
      } else if (status.honoured === false) {
        badge = 'not active'
        tone = 'warn'
        const known = REASON_TEXT[status.reason]
        const own = text(status.message)
        lines.push(`Not active. ${own || known || 'Core has not said why.'}`)
        if (known && own && own !== known) lines.push(known)
        if (status.conflict === true) lines.push(conflictLine(row))
        const failed = list(object(status.capabilities)?.failed).map(failedCapabilityLine).filter(Boolean)
        if (failed.length) {
          lines.push('Capabilities that do not match:')
          lines.push(...failed)
        }
      }
      if (status.honoured === true) {
        const missing = ids(status.unregistered)
        if (status.degraded === true || missing.length) {
          if (status.degraded === true) { badge = 'active, degraded'; tone = 'warn' }
          lines.push(missing.length
            ? `Some contracts are not registered yet: ${missing.join(', ')}. Other modules that call them may see them as unavailable.`
            : 'Some contracts are not registered yet. Other modules that call them may see them as unavailable.')
        }
        for (const item of list(status.registered_mismatch)) {
          const line = registeredMismatchText(item)
          if (line) lines.push(line)
        }
        if (list(status.registered_mismatch).some((item) => registeredMismatchText(item)) && badge === 'active replacement') { badge = 'active, degraded'; tone = 'warn' }
      }
    }
  }

  if (replacedBy) {
    lines.push(`Replaced by ${replacedBy}. While it is active, it serves this module's routes and contracts. This module stays disabled; Core never runs both.`)
    if (!badge) { badge = `replaced by ${replacedBy}`; tone = 'warn' }
  }
  return { badge, tone, lines }
}

export function isReplacementProblem(problem) {
  return problem?.type === 'replacement_conflict' || problem?.type === 'replacement_incomplete'
}

// One sentence for a plan problem. Non-replacement problems keep the old "module - type" text.
export function replacementProblemText(problem) {
  const module = text(problem?.module) || 'plan'
  if (!isReplacementProblem(problem)) return `${module} - ${problem?.type}`
  const known = REASON_TEXT[problem.reason]
  const message = text(problem.message) || known || `${module} cannot be used with the module it replaces or is replaced by.`
  const replaces = text(problem.replaces)
  const replacedBy = text(problem.replaced_by)
  let out = `${module}: ${message}`
  if (problem.type === 'replacement_conflict') {
    const first = replacedBy || (problem.reason === 'competing-replacement' ? '' : replaces)
    if (/disable/i.test(message)) out += ' Then try again.'
    else if (first) out += ` Disable ${first} first, then try again.`
    else out += ' Disable the other replacement first, then try again.'
  } else {
    const failed = list(problem.capabilities).map((item) => {
      const name = text(item?.capability)
      return name ? `${name}${CAPABILITY_REASON_TEXT[item?.reason] ? ` (${CAPABILITY_REASON_TEXT[item.reason]})` : ''}` : ''
    }).filter(Boolean)
    if (failed.length) out += ` Capabilities to fix: ${failed.join(', ')}.`
  }
  return out
}
