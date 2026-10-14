import { TACTICAL_COLOUR_FIELDS, TACTICAL_UI_CONTEXT_KEYS } from './tactical-ui-apply.js'

export async function changePasswordWorkflow(password, { changeMyPassword }) {
  if (!password?.current || !password?.next) throw new Error('Current and new passwords are required.')
  if (password.next !== password.confirm) throw new Error('New password and confirmation do not match.')
  const result = await changeMyPassword(password.current, password.next)
  return { message: `Password changed. ${Number(result?.other_sessions_revoked || 0)} other session(s) signed out.` }
}

export async function resetTotpWorkflow(mfa, { resetMyTotp, confirmReset, clearSession, reload }) {
  const password = String(mfa?.password || '')
  const code = String(mfa?.code || '').trim()
  if (!password || !code) throw new Error('Current password and authenticator code are required.')
  if (confirmReset && !(await confirmReset())) return { cancelled: true }
  await resetMyTotp(password, code)
  clearSession?.()
  reload?.()
  return { reset: true }
}

export async function revokeOthersWorkflow({ revokeMyOtherSessions, confirmRevoke }) {
  if (confirmRevoke && !(await confirmRevoke())) return { cancelled: true }
  const result = await revokeMyOtherSessions()
  return { message: `${Number(result?.revoked || 0)} other session(s) signed out.` }
}

// 0.12.106: the Tactical UI form. Only the fields the Tactical UI form edits, in the order Core's PUT documents.
// block_dashboard_login is not a UI preference and is never sent.
const TACTICAL_UI_BOOLEANS = ['dark_mode', 'show_community_scripts', 'clear_search_when_switching']
const TACTICAL_UI_TEXT = ['agent_dblclick_action', 'default_agent_tbl_tab', 'client_tree_sort', 'date_format', ...Object.keys(TACTICAL_COLOUR_FIELDS)]
const TACTICAL_UI_EDITABLE = ['agent_dblclick_action', 'url_action_id', ...TACTICAL_UI_BOOLEANS, 'default_agent_tbl_tab', 'client_tree_sort', 'client_tree_splitter', ...Object.keys(TACTICAL_COLOUR_FIELDS), 'date_format']
// Mirrors Core's rules so Save can be disabled early. Core stays the authority (AD-12).
const DATE_FORMAT_PATTERN = /^[A-Za-z0-9 :\/.,\[\]-]{1,30}$/
const COLOUR_NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/
const COLOUR_HEX_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function normaliseField(key, value) {
  if (TACTICAL_UI_BOOLEANS.includes(key)) return value === true
  if (key === 'url_action_id') return value === null || value === undefined || value === '' ? null : Number(value)
  if (key === 'client_tree_splitter') return Number(value)
  if (TACTICAL_UI_TEXT.includes(key)) return value === null || value === undefined ? '' : String(value).trim()
  return value
}

// The fields that differ from the saved values. A field the form does not carry is not sent. Booleans stay booleans.
export function changedFields(form, original = {}) {
  const changed = {}
  for (const key of TACTICAL_UI_EDITABLE) {
    if (!form || !(key in form)) continue
    const now = normaliseField(key, form[key])
    const before = normaliseField(key, original?.[key])
    if (now !== before) changed[key] = now
  }
  return changed
}

// The first problem with the changed fields, as a sentence, or '' when they can be sent. canRunUrlActions false blocks a
// URL Action choice before any request; a missing flag does not block (Core decides).
export function tacticalUiProblem(form, changed = changedFields(form), { canRunUrlActions } = {}) {
  if ('client_tree_splitter' in changed) {
    const value = changed.client_tree_splitter
    if (!Number.isInteger(value) || value < 1 || value > 99) return 'Client tree splitter must be a whole number from 1 to 99.'
  }
  if ('date_format' in changed) {
    const value = changed.date_format
    if (value !== '' && !DATE_FORMAT_PATTERN.test(value)) return 'Date format must be empty or up to 30 letters, digits, spaces and : / - . , [ ].'
  }
  for (const field of Object.keys(TACTICAL_COLOUR_FIELDS)) {
    if (!(field in changed)) continue
    const value = changed[field]
    if (!COLOUR_NAME_PATTERN.test(value) && !COLOUR_HEX_PATTERN.test(value)) {
      return 'Enter a colour name such as red, or a # colour of 3, 4, 6 or 8 digits, up to 40 characters.'
    }
  }
  if (canRunUrlActions === false) {
    if (changed.agent_dblclick_action === 'urlaction' || (changed.url_action_id !== undefined && changed.url_action_id !== null)) {
      return 'Your Tactical role does not permit URL Actions.'
    }
  }
  return ''
}

// Saves only the changed fields in one PUT (Core's route is a partial update, all or nothing). Nothing is sent when
// nothing changed, and nothing is sent when the change fails the local check. A Core refusal throws with Core's text.
export async function saveTacticalUiWorkflow(form, { saveMyTacticalUiPreferences, original = {}, canRunUrlActions } = {}) {
  const changed = changedFields(form, original)
  if (Object.keys(changed).length === 0) return { preferences: null, unchanged: true, message: 'No Tactical UI changes to save.' }
  const problem = tacticalUiProblem(form, changed, { canRunUrlActions })
  if (problem) throw new Error(problem)
  const response = await saveMyTacticalUiPreferences(changed)
  return { preferences: response?.preferences || null, message: 'Tactical UI preferences saved.' }
}

// Copies the hot-path keys of Core's answer into context.tactical_ui in place (its object identity survives for modules
// that hold it). Choice lists and the URL Action catalogue are not copied.
export function applyTacticalUiPreferences(context, preferences) {
  if (!context || typeof context !== 'object') return context
  const source = preferences && typeof preferences === 'object' ? preferences : {}
  const next = {}
  for (const key of TACTICAL_UI_CONTEXT_KEYS) {
    if (key in source) next[key] = source[key]
  }
  if (context.tactical_ui && typeof context.tactical_ui === 'object') {
    Object.assign(context.tactical_ui, next)
  } else {
    context.tactical_ui = { ...next }
  }
  return context
}
