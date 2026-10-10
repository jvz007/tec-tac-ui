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

// True only when Core says enabling this row switches off an enabled replacement
// (Core 1.17.12) and names it. Anything else keeps the single confirmation.
export function secondConfirmationRequired(row) {
  return row?.second_confirmation_required === true && willDisableIds(row?.will_disable).length > 0
}

// The notice for enabling a replaced module while its replacement is enabled.
export function handBackEnableLines(moduleId, willDisable) {
  const names = willDisableIds(willDisable)
  const who = text(moduleId) || 'This module'
  if (!names.length) return []
  const many = names.length > 1
  const them = many ? 'them' : names[0]
  return [
    `Enabling ${who} will switch off ${nameList(names)}, ${many ? 'the replacements, which are' : 'the replacement, which is'} enabled now.`,
    `${many ? 'They stay' : `${names[0]} stays`} installed.`,
    `${who} takes its routes and contracts back.`,
    `Disabling ${them} later switches ${who} back on. To use ${them} again, disable ${who} first, then enable ${them}.`,
  ]
}

// The text beside the second confirmation checkbox and button.
export function secondConfirmationText(willDisable, moduleId) {
  const names = willDisableIds(willDisable)
  const who = text(moduleId) || 'this module'
  if (!names.length) return { warning: '', checkbox: '', button: '' }
  const list = nameList(names)
  const many = names.length > 1
  return {
    warning: `${list} ${many ? 'are' : 'is'} enabled and in use. Continuing switches ${many ? 'them' : 'it'} off and hands the routes and contracts back to ${who}.`,
    checkbox: `I understand ${list} will be switched off`,
    button: `Switch ${list} off and enable ${who}`,
  }
}

// HTTP 400 replacement_second_confirmation_required: { willDisable, detail, module },
// else null so the ordinary error path keeps handling it. Core 1.17.14 also names
// dependants; the key appears only when it has some, so an older answer keeps its shape.
export function secondConfirmationRequiredPayload(error) {
  if (!error || error.status !== 400) return null
  const payload = object(error.payload)
  const code = text(payload?.code) || text(error.code)
  if (code !== 'replacement_second_confirmation_required') return null
  const result = { willDisable: willDisableIds(payload?.will_disable), detail: text(payload?.detail), module: text(payload?.module) }
  const dependants = dependantsRows(payload?.dependants)
  if (dependants.length) result.dependants = dependants
  return result
}

// [{replacement, modules[]}] (Core 1.17.14, CQ35): the enabled modules that name a replacement directly.
// Rows with no replacement id or no module id drop out.
export function dependantsRows(value) {
  const out = []
  for (const item of list(value)) {
    const replacement = text(item?.replacement)
    const modules = ids(item?.modules)
    if (replacement && modules.length) out.push({ replacement, modules })
  }
  return out
}

// Step-two lines: for each replacement that will be switched off, the enabled modules that name it.
// They are not switched off (Core does not cascade), so the lines ask the person to check them.
export function dependantLines(dependants, willDisable) {
  const rows = dependantsRows(dependants)
  const lines = []
  for (const name of willDisableIds(willDisable)) {
    const row = rows.find((item) => item.replacement === name)
    if (!row) continue
    const many = row.modules.length > 1
    lines.push(`${nameList(row.modules)} ${many ? 'name' : 'names'} ${name} as a dependency. ${many ? 'They stay' : `${row.modules[0]} stays`} enabled. Check that ${many ? 'they still work' : 'it still works'} once ${name} is switched off.`)
  }
  return lines
}

// [{module, reasons[], required[]}] from hand_back_unavailable (Core 1.17.14). A row without a module id drops out.
export function handBackUnavailableRows(value) {
  const out = []
  for (const item of list(value)) {
    const module = text(item?.module)
    if (!module) continue
    out.push({ module, reasons: list(item.reasons).map(text).filter(Boolean), required: ids(item.required_modules) })
  }
  return out
}

// HTTP 400 replacement_hand_back_confirmation_required (Core 1.17.14 for a disable, 1.17.15 for an uninstall):
// { module, willEnable, unavailable, detail }, else null so the ordinary error path keeps handling it.
export function handBackRequiredPayload(error) {
  if (!error || error.status !== 400) return null
  const payload = object(error.payload)
  const code = text(payload?.code) || text(error.code)
  if (code !== 'replacement_hand_back_confirmation_required') return null
  return {
    module: text(payload?.module),
    willEnable: willEnableIds(payload?.will_enable),
    unavailable: handBackUnavailableRows(payload?.hand_back_unavailable),
    detail: text(payload?.detail),
  }
}

// The warning shown before a replacement is disabled (mode 'disable') or uninstalled (mode 'remove') while the
// replaced module cannot come back. Returns { lines, button }; no lines means nothing to warn about.
export function handBackWarning(mode, moduleId, unavailable, willEnable) {
  const rows = handBackUnavailableRows(unavailable)
  if (!rows.length) return { lines: [], button: '' }
  const who = text(moduleId) || 'This module'
  const names = rows.map((row) => row.module)
  const many = names.length > 1
  const remove = mode === 'remove'
  const back = willEnableIds(willEnable)
  const lines = [`${remove ? 'Uninstalling' : 'Disabling'} ${who} leaves ${nameList(names)} switched off, because ${many ? 'they' : 'it'} cannot come back cleanly.`]
  for (const row of rows) {
    const reason = row.reasons.map((item) => item.replace(/[\s.]+$/, '')).join('; ')
    const needs = row.required.length ? ` It needs ${nameList(row.required)}.` : ''
    lines.push(`${row.module}: ${reason || 'Core did not say why'}.${needs}`)
  }
  if (back.length) lines.push(`${nameList(back)} ${back.length > 1 ? 'still come' : 'still comes'} back on.`)
  lines.push(`Until ${many ? 'they are' : 'it is'} enabled again, nothing serves ${many ? 'their' : 'its'} routes and contracts.`)
  lines.push('Continue only if you are happy for them to stay off for now.')
  return {
    lines,
    button: remove ? `Uninstall ${who} and leave ${nameList(names)} off` : `Disable ${who} and leave ${nameList(names)} off`,
  }
}

// Core asked for a second confirmation but named nothing to switch off. The page shows this text,
// closes the dialog and reloads. Core's own detail wins; else a plain sentence.
export function emptySecondConfirmationText(second) {
  return text(second?.detail) || 'Core asked for a second confirmation but did not name a module to switch off. Nothing was changed. The list has been reloaded, so check it and try again.'
}

// The module ids an enabled replacement hands back to (Core 1.17.12).
export function willEnableIds(value) {
  return willDisableIds(value)
}

// The notice for disabling a replacement. This direction has no second confirmation.
export function handBackDisableLines(moduleId, willEnable) {
  const names = willEnableIds(willEnable)
  const who = text(moduleId) || 'This module'
  if (!names.length) return []
  return [`Disabling ${who} switches ${nameList(names)} back on in the same job.`]
}

// "Switched off: A" style lines for a job row. Missing or non-array fields show nothing.
export function jobSwitchLines(job) {
  const out = []
  const add = (label, value) => { const names = willDisableIds(value); if (names.length) out.push(`${label}: ${names.join(', ')}`) }
  add('Switched off', job?.disabled_modules)
  add('Switched on', job?.enabled_modules)
  add('Conflict resolved', job?.reconciled_modules)
  return out
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

  const willEnable = willEnableIds(row?.will_enable)
  if (willEnable.length && status?.honoured === true) lines.push(`Disabling this module switches ${nameList(willEnable)} back on in the same job.`)

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
