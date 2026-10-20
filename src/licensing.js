// 0.12.118: licensing controls (Core 1.17.58, docs/module-licensing.md and docs/runtime-settings.md). Pure logic plus the two
// requests. Core decides everything here: the mode, the licence state, what would be refused and who may override. This file
// only reads Core's allow-listed answer, puts it in plain words and sends the one-key PATCH. Licensing never blocks sign-in,
// Tactical operations, rollback or security updates, and nothing here touches them. No key, token or fingerprint is read or shown.
import { apiFetch } from './api.js'

export const LICENSING_STATUS_PATH = '/api/tfd/system/licensing/'
export const RUNTIME_SETTINGS_PATH = '/api/tfd/system/runtime-settings/'
export const LICENSING_MODE_KEY = 'licensing_enforcement_mode'
export const LICENSING_MODES = Object.freeze(['off', 'log-only', 'enforce'])
export const LICENSING_MODE_DEFAULT = 'log-only'
export const WOULD_BLOCK_LIMIT = 50

export const MODE_LABELS = Object.freeze({ off: 'Off', 'log-only': 'Log only', enforce: 'Enforce' })
// One plain sentence per mode.
export const MODE_SENTENCES = Object.freeze({
  off: 'Core stops checking licences. A module that needs a licence is not checked at stage or install.',
  'log-only': 'A module that would be refused is still allowed, and Core writes a record of it.',
  enforce: 'A module that needs a licence is refused at stage and install.',
})
export const NEVER_BLOCKED_LEAD = 'Licensing never blocks:'

export function modeLabel(value) {
  return Object.prototype.hasOwnProperty.call(MODE_LABELS, value) ? MODE_LABELS[value] : (typeof value === 'string' && value ? value : '—')
}

// Display only: the selector shows for a superuser. Core refuses everyone else with 403.
export function canChangeLicensingMode(context = {}) {
  return context?.user?.superuser === true
}

// { value, source, choices, default } from the runtime-settings answer, or null when this Core sends no licensing mode.
export function normalizeLicensingMode(payload) {
  const entry = payload && typeof payload === 'object' ? payload[LICENSING_MODE_KEY] : null
  if (!entry || typeof entry !== 'object') return null
  const known = (value, fallback) => (LICENSING_MODES.includes(value) ? value : fallback)
  const choices = Array.isArray(entry.choices) ? entry.choices.filter((item) => LICENSING_MODES.includes(item)) : []
  return {
    value: known(entry.value, LICENSING_MODE_DEFAULT),
    source: typeof entry.source === 'string' ? entry.source : '',
    choices: choices.length ? choices : [...LICENSING_MODES],
    default: known(entry.default, LICENSING_MODE_DEFAULT),
  }
}

// The one plain Yes or No before a change. Danger wording for enforce and for off.
export function modeConfirmation(choice) {
  if (choice === null) {
    return { question: "Use Core's default licensing mode?", detail: 'Core goes back to its own default, which is log only.', danger: false }
  }
  if (choice === 'enforce') {
    return { question: 'Switch licensing to enforce?', detail: 'A module that needs a licence will be refused at stage and install. Sign-in, Tactical operations, rollback and security updates are never blocked.', danger: true }
  }
  if (choice === 'off') {
    return { question: 'Switch licensing off?', detail: 'Core will stop checking licences. A module that needs a licence will not be checked at all.', danger: true }
  }
  return { question: 'Switch licensing to log only?', detail: 'A module that would be refused is still allowed, and Core writes a record of it.', danger: false }
}

// PATCH with exactly one key. null puts the mode back to Core's default. Core refuses a mixed body, so nothing else is sent.
// Core's 400, 403 and 429 sentences reach the caller unchanged in error.message.
export async function saveLicensingMode(choice, { api = apiFetch } = {}) {
  if (choice !== null && !LICENSING_MODES.includes(choice)) {
    throw Object.assign(new Error('Choose off, log only or enforce.'), { status: 0, payload: null, code: null })
  }
  return normalizeLicensingMode(await api(RUNTIME_SETTINGS_PATH, {
    method: 'PATCH',
    body: JSON.stringify({ [LICENSING_MODE_KEY]: choice }),
  }))
}

const STATE_SENTENCES = Object.freeze({
  licensing_unavailable: 'Module licensing is not live yet, so no module is treated as licensed',
  licensed: 'The licence is active.',
  unlicensed: 'No licence is recorded for this server.',
  expired: 'The licence has expired.',
  revoked: 'The licence was revoked.',
  unavailable: 'The licensing service is not available.',
  invalid: 'The licence could not be verified.',
  provisional: 'Module licensing is still provisional.',
  unknown: 'Core did not report a known licence state.',
})
export const LICENCE_STATES = Object.freeze(Object.keys(STATE_SENTENCES))
// A state this UI does not know reads as unknown.
export function licenceState(value) {
  return Object.prototype.hasOwnProperty.call(STATE_SENTENCES, value) ? value : 'unknown'
}
export function licenceSentence(value) {
  return STATE_SENTENCES[licenceState(value)]
}

const text = (value, max = 400) => (typeof value === 'string' ? value.slice(0, max) : '')

// Only the allow-listed fields of Core's answer are kept. Anything else on the answer never reaches the page.
export function normalizeLicensingStatus(payload) {
  if (!payload || typeof payload !== 'object') return null
  const mode = payload.mode && typeof payload.mode === 'object' ? payload.mode : {}
  const licence = payload.licence && typeof payload.licence === 'object' ? payload.licence : {}
  const would = payload.would_block && typeof payload.would_block === 'object' ? payload.would_block : {}
  const grace = payload.grace && typeof payload.grace === 'object' ? payload.grace : {}
  const listed = (Array.isArray(would.modules) ? would.modules : []).slice(0, WOULD_BLOCK_LIMIT).map((item) => ({
    module: text(item?.module_id, 120),
    version: text(item?.version, 60),
    state: text(item?.state, 60),
    reason: text(item?.reason),
  }))
  const count = Number.isInteger(would.count) && would.count >= 0 ? would.count : listed.length
  const daysLeft = Number.isInteger(grace.days_left) && grace.days_left >= 0 ? grace.days_left : null
  return {
    mode: {
      value: LICENSING_MODES.includes(mode.value) ? mode.value : LICENSING_MODE_DEFAULT,
      source: text(mode.source, 40),
    },
    licenceState: licenceState(licence.state),
    licenceReason: text(licence.reason),
    wouldBlock: { count, modules: listed, more: Math.max(0, count - listed.length) },
    grace: {
      windowDays: Number.isInteger(grace.window_days) && grace.window_days >= 0 ? grace.window_days : null,
      daysLeft,
      reason: text(grace.reason),
    },
    neverBlocked: (Array.isArray(payload.never_blocked) ? payload.never_blocked : []).filter((item) => typeof item === 'string').slice(0, 12).map((item) => text(item, 80)),
    revokedEffect: text(payload.revoked_effect),
  }
}

// Where the mode came from, in words.
export function sourceText(source) {
  if (source === 'default') return "Core's default"
  if (source === 'setting' || source === 'stored' || source === 'runtime') return 'chosen by a superuser'
  return source || 'not reported'
}

// The grace line: a number only when Core sent a whole number of days. Otherwise Core's own reason, with no number of ours.
export function graceLine(grace) {
  if (grace && Number.isInteger(grace.daysLeft)) return `${grace.daysLeft} day${grace.daysLeft === 1 ? '' : 's'} left in the grace window.`
  return (grace && grace.reason) || 'The grace window is not running yet.'
}

// { status } for the panel, or { hidden: true } on 403 (not allowed) and 404 (an older Core). Other errors are thrown.
export async function getLicensingStatus({ api = apiFetch } = {}) {
  try {
    const status = normalizeLicensingStatus(await api(LICENSING_STATUS_PATH))
    return status ? { status } : { hidden: true }
  } catch (error) {
    if (error?.status === 403 || error?.status === 404) return { hidden: true }
    throw error
  }
}

// ---- the audited override on stage and install (Core 1.17.58, part 3) ----

export const OVERRIDE_FIELD = 'licence_override_reason'
export const OVERRIDE_MAX = 500
const OVERRIDE_BAD = new RegExp('[\u0000-\u001f\u007f-\u009f​-‏  ‪-‮⁠-⁤⁦-⁯﻿]')

// Display only. Core decides, and checks the superuser again.
export function canOverrideLicence(context = {}) {
  return context?.user?.superuser === true
}

// Core's refusal as the page may show it, or null when this is not a licence refusal in enforce mode.
// The override appears only for 403 'licensing_requirement_failed' whose licensing.enforcement_mode is 'enforce'.
export function readLicenceRefusal(error) {
  if (!error || Number(error.status) !== 403) return null
  const payload = error.payload && typeof error.payload === 'object' ? error.payload : null
  if (!payload || payload.code !== 'licensing_requirement_failed') return null
  const licensing = payload.licensing && typeof payload.licensing === 'object' ? payload.licensing : null
  if (!licensing || licensing.enforcement_mode !== 'enforce') return null
  return {
    detail: text(payload.detail) || 'Core refused this module because it needs a licence.',
    module: text(licensing.module, 120),
    moduleVersion: text(licensing.module_version, 60),
    state: text(licensing.state, 60),
  }
}

// Whether to draw the override control: a superuser, after an enforce-mode licence refusal.
export function showOverride(context, refusal) {
  return Boolean(refusal) && canOverrideLicence(context)
}

// Core decides. This only saves a round trip: 1 to 500 characters, no control or invisible characters.
export function validateOverrideReason(value) {
  if (typeof value !== 'string' || !value.trim()) return { valid: false, message: 'Enter a reason of 1 to 500 characters, with no control or hidden characters.' }
  if (value.length > OVERRIDE_MAX || OVERRIDE_BAD.test(value)) return { valid: false, message: 'Enter a reason of 1 to 500 characters, with no control or hidden characters.' }
  return { valid: true, message: '' }
}

export function overrideConfirmation(moduleId) {
  const name = moduleId || 'this module'
  return { question: `Let ${name} through without a licence?`, detail: 'Core records your reason and your name.', danger: true }
}

// Plain words for Core's two override errors. Anything else is shown as sent.
export function overrideErrorSentence(error) {
  const code = error?.code || error?.payload?.code
  if (Number(error?.status) === 403 && code === 'licence_override_superuser_required') return 'Only a superuser can override a licence refusal.'
  if (Number(error?.status) === 400 && code === 'invalid_licence_override_reason') return 'Enter a reason of 1 to 500 characters, with no control or hidden characters.'
  return typeof error?.message === 'string' ? error.message : ''
}

// The reason goes in the request only when it is a non-empty string, so a call without one is exactly what it was.
export function overrideReasonValue(value) {
  return typeof value === 'string' && value !== '' ? value : null
}
