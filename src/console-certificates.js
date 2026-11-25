import { apiFetch } from './api.js'

// Engineer Console certificates (Core 1.18.52, UI 0.13.6). Core is the authority for every rule here. Hiding a control
// is display only: each 400, 403, 409, 429 and 503 message from Core is shown as it was sent. The Console's own
// enrolment route (no sign-in) is never called from the browser.

export const CONSOLE_CERT_PAGE_PATH = '/access/console-certificates'
export const CONSOLE_CERT_VIEW = 'core.console_certificates.view'
export const CONSOLE_CERT_MANAGE = 'core.console_certificates.manage'
export const CONSOLE_CERT_PAGE_SIZE = 50
export const CONSOLE_CERT_STATES = Object.freeze(['active', 'expired', 'revoked'])
export const REVOKE_REASONS = Object.freeze([
  { value: 'lost', label: 'The PC was lost or stolen' },
  { value: 'left', label: 'The engineer left' },
  { value: 'admin', label: 'Administrator decision' },
  { value: 'other', label: 'Another reason' },
])
export const REVOKE_REASON_VALUES = Object.freeze(REVOKE_REASONS.map((item) => item.value))

// Core's own words are used as sent. These are shown only when Core sends none.
export const NO_CERTIFICATE_TEXT = 'Ask your administrator to issue you a Console certificate.'
export const OPEN_SESSION_NOTE = 'This does not end a session that is already open.'
export const REVOKE_QUESTION = 'Revoke this Console certificate?'
export const REVOKE_DETAIL = `Core marks the certificate revoked. ${OPEN_SESSION_NOTE}`
export const CANCEL_ENROLMENT_QUESTION = 'Cancel this open enrolment?'
export const CANCEL_ENROLMENT_DETAIL = 'The engineer cannot enrol a PC until you allow it again. A code already made stops working.'
export const REPLACE_CA_QUESTION = 'Replace the Console certificate authority?'
export const REPLACE_CA_DETAIL = `Every active certificate is revoked. Every open enrolment is cancelled. The server id changes, so engineers must be allowed again and enrol again. ${OPEN_SESSION_NOTE}`

function heldPermissions(context) {
  return Array.isArray(context?.permissions) ? context.permissions : []
}

export function canViewConsoleCertificates(context = {}) {
  if (context?.user?.superuser === true) return true
  const held = heldPermissions(context)
  return held.includes(CONSOLE_CERT_VIEW) || held.includes(CONSOLE_CERT_MANAGE)
}

export function canManageConsoleCertificates(context = {}) {
  if (context?.user?.superuser === true) return true
  return heldPermissions(context).includes(CONSOLE_CERT_MANAGE)
}

// Only an effective superuser replaces the certificate authority.
export function canReplaceConsoleCa(context = {}) {
  return context?.user?.superuser === true
}

const text = (value) => (typeof value === 'string' ? value : '')
const nullableText = (value) => (typeof value === 'string' && value ? value : null)

export function normalizeCertificate(row) {
  if (!row || typeof row !== 'object') return null
  const serial = text(row.serial)
  if (!serial) return null
  return {
    serial,
    short_serial: text(row.short_serial) || serial.slice(-8),
    pc_label: text(row.pc_label),
    username: text(row.username),
    engineer_id: Number.isInteger(row.engineer_id) ? row.engineer_id : null,
    issued_at: nullableText(row.issued_at),
    not_after: nullableText(row.not_after),
    state: CONSOLE_CERT_STATES.includes(row.state) ? row.state : 'active',
    expiring: row.expiring === true,
    revoked_at: nullableText(row.revoked_at),
    revoked_reason: nullableText(row.revoked_reason),
    last_used_at: nullableText(row.last_used_at),
  }
}

export function normalizeEnrolment(row) {
  if (!row || typeof row !== 'object' || row.id == null) return null
  return {
    id: String(row.id),
    engineer_id: Number.isInteger(row.engineer_id) ? row.engineer_id : null,
    username: text(row.username),
    authorised_by: Number.isInteger(row.authorised_by) ? row.authorised_by : null,
    authorised_by_username: text(row.authorised_by_username),
    authorised_at: nullableText(row.authorised_at),
    expires_at: nullableText(row.expires_at),
    state: text(row.state),
    code_active: row.code_active === true,
  }
}

const list = (value, normalise) => (Array.isArray(value) ? value.map(normalise).filter(Boolean) : [])

export function normalizeMine(payload) {
  if (!payload || typeof payload !== 'object') return null
  return {
    certificates: list(payload.certificates, normalizeCertificate),
    enrolment: normalizeEnrolment(payload.enrolment),
    host: nullableText(payload.host),
    server_id: nullableText(payload.server_id),
    validity_days: Number.isInteger(payload.validity_days) ? payload.validity_days : null,
  }
}

export function normalizeCertificateList(payload) {
  const body = payload && typeof payload === 'object' ? payload : {}
  return {
    count: Number.isInteger(body.count) ? body.count : 0,
    page: Number.isInteger(body.page) && body.page > 0 ? body.page : 1,
    page_size: Number.isInteger(body.page_size) && body.page_size > 0 ? body.page_size : CONSOLE_CERT_PAGE_SIZE,
    results: list(body.results, normalizeCertificate),
    enrolments: list(body.enrolments, normalizeEnrolment),
  }
}

export function normalizeCa(payload) {
  if (!payload || typeof payload !== 'object') return null
  return {
    exists: payload.exists === true,
    server_id: nullableText(payload.server_id),
    not_before: nullableText(payload.not_before),
    not_after: nullableText(payload.not_after),
    expires_in_days: Number.isInteger(payload.expires_in_days) ? payload.expires_in_days : null,
    expiring: payload.expiring === true,
    active_certificates: Number.isInteger(payload.active_certificates) ? payload.active_certificates : 0,
    retired_cas: Number.isInteger(payload.retired_cas) ? payload.retired_cas : 0,
    master_key_available: payload.master_key_available !== false,
  }
}

// The state a row or card shows: revoked and expired win; an active certificate close to its end is "expiring".
export function certificateDisplayState(cert) {
  if (!cert) return 'none'
  if (cert.state === 'revoked') return 'revoked'
  if (cert.state === 'expired') return 'expired'
  return cert.expiring ? 'expiring' : 'active'
}

// The state of the My Account card: none (nothing issued and no open enrolment), open (an enrolment is waiting for a code),
// expiring, active, or ended (every certificate is revoked or expired and nothing is open).
export function cardState(mine) {
  if (!mine) return 'none'
  if (mine.enrolment) return 'open'
  const certs = mine.certificates || []
  if (!certs.length) return 'none'
  const states = certs.map(certificateDisplayState)
  if (states.includes('expiring')) return 'expiring'
  if (states.includes('active')) return 'active'
  return 'ended'
}

// A host the browser may put in a launch link: a plain host name or an IPv4 address, no port, no path, no spaces.
const PLAIN_HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/
const ENROL_CODE = /^[A-Za-z0-9_-]{43}$/
export function isPlainHost(host) {
  return typeof host === 'string' && PLAIN_HOST.test(host) && !host.includes('..')
}
export function isEnrolCode(code) {
  return typeof code === 'string' && ENROL_CODE.test(code)
}

// tectac-console://enrol?host=<host>&code=<code>, or '' when the host or the code is not in the expected form. The caller
// then offers the code only. The code is never written anywhere but the component that shows it.
export function enrolLink(host, code) {
  if (!isPlainHost(host) || !isEnrolCode(code)) return ''
  return `tectac-console://enrol?host=${encodeURIComponent(host)}&code=${encodeURIComponent(code)}`
}

export function revokeBody(reason) {
  if (!REVOKE_REASON_VALUES.includes(reason)) throw Object.assign(new Error('Choose a reason.'), { status: 0, payload: null, code: null })
  return { reason }
}

export function listQuery({ engineer = '', state = '', page = 1, pageSize = CONSOLE_CERT_PAGE_SIZE } = {}) {
  const params = new URLSearchParams()
  const engineerId = Number.parseInt(engineer, 10)
  if (Number.isInteger(engineerId) && engineerId > 0) params.set('engineer', String(engineerId))
  if (CONSOLE_CERT_STATES.includes(state)) params.set('state', state)
  params.set('page', String(Math.max(1, Number.parseInt(page, 10) || 1)))
  params.set('page_size', String(Math.max(1, Math.min(100, Number.parseInt(pageSize, 10) || CONSOLE_CERT_PAGE_SIZE))))
  return `?${params.toString()}`
}

// The text for a failed call. Core's own message is used as sent, except the one 409 that means "not allowed to enrol yet".
export function consoleCertificateError(error, fallback = 'The request failed.') {
  if (error?.status === 409 && error?.code === 'enrolment_required') return NO_CERTIFICATE_TEXT
  return error?.message || fallback
}

// Older Core: GET mine/ answers 404, so the card is left out. Other errors are thrown.
export async function getMyConsoleCertificates({ api = apiFetch } = {}) {
  try {
    return normalizeMine(await api('/api/tfd/console-certificates/mine/'))
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

// POST with no body. The answer holds the one-time code: the caller keeps it in a component ref and nowhere else.
export function requestEnrolmentCode({ api = apiFetch } = {}) {
  return api('/api/tfd/console-certificates/mine/enrolment-code/', { method: 'POST' })
}

export async function listConsoleCertificates(query = {}, { api = apiFetch } = {}) {
  const suffix = listQuery(query)
  return normalizeCertificateList(await api(`/api/tfd/console-certificates/${suffix}`))
}

export async function issueConsoleEnrolment(userId, { api = apiFetch } = {}) {
  if (!Number.isInteger(userId) || userId < 1) throw Object.assign(new Error('Choose an engineer.'), { status: 0, payload: null, code: null })
  return api('/api/tfd/console-certificates/issue/', { method: 'POST', body: JSON.stringify({ user_id: userId }) })
}

export function cancelConsoleEnrolment(id, { api = apiFetch } = {}) {
  return api(`/api/tfd/console-certificates/enrolments/${encodeURIComponent(id)}/cancel/`, { method: 'POST' })
}

export async function revokeConsoleCertificate(serial, reason, { api = apiFetch } = {}) {
  return api(`/api/tfd/console-certificates/${encodeURIComponent(serial)}/revoke/`, { method: 'POST', body: JSON.stringify(revokeBody(reason)) })
}

export async function getConsoleCa({ api = apiFetch } = {}) {
  return normalizeCa(await api('/api/tfd/console-certificates/ca/'))
}

export function replaceConsoleCa({ api = apiFetch } = {}) {
  return api('/api/tfd/console-certificates/ca/replace/', { method: 'POST', body: JSON.stringify({ confirm: true }) })
}
