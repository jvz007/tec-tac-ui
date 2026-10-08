import { apiFetch } from './api.js'

export const UPDATE_SOURCE_PATH = '/api/tfd/system/update-source/'
export const UPDATE_SOURCE_COMPONENTS = Object.freeze(['framework', 'ui'])
export const BRANCH_NAME_MAX = 200

const RELEASE = Object.freeze({ type: 'release', ref: null })

// Mirrors Core's rule so a bad name is caught before the round trip. Core still
// decides: it answers 400 with its own message for anything it refuses.
export function validateBranchName(ref) {
  if (typeof ref !== 'string' || !ref.trim()) return { valid: false, message: 'Enter a branch name.' }
  if (ref !== ref.trim()) return { valid: false, message: 'A branch name cannot start or end with a space.' }
  if (ref.length > BRANCH_NAME_MAX) return { valid: false, message: `A branch name can be at most ${BRANCH_NAME_MAX} characters.` }
  if (!/^[A-Za-z0-9._/-]+$/.test(ref)) return { valid: false, message: 'Use letters, digits and . _ / - only.' }
  if (ref.includes('..') || ref.includes('//')) return { valid: false, message: 'A branch name cannot contain ".." or "//".' }
  if (ref.startsWith('-') || ref.startsWith('/')) return { valid: false, message: 'A branch name cannot start with "-" or "/".' }
  if (ref.endsWith('/') || ref.endsWith('.') || ref.endsWith('.lock')) return { valid: false, message: 'A branch name cannot end with "/", "." or ".lock".' }
  return { valid: true, message: '' }
}

function normalizeSource(value) {
  if (value && typeof value === 'object' && value.type === 'branch' && typeof value.ref === 'string' && value.ref) {
    return { type: 'branch', ref: value.ref }
  }
  return { ...RELEASE }
}

// Accepts the whole payload ({update_sources: {...}}) or the map itself. A
// missing or unknown entry means the release source, which is Core's default.
export function normalizeUpdateSources(payload) {
  const map = payload && typeof payload === 'object' && payload.update_sources && typeof payload.update_sources === 'object'
    ? payload.update_sources
    : payload
  const out = {}
  for (const component of UPDATE_SOURCE_COMPONENTS) out[component] = normalizeSource(map && typeof map === 'object' ? map[component] : null)
  return out
}

// True when this Core reports update_sources on GET /system/updates/.
export function supportsUpdateSource(status) {
  return Boolean(status && typeof status === 'object' && status.update_sources && typeof status.update_sources === 'object')
}

export async function getUpdateSource({ api = apiFetch } = {}) {
  const payload = await api(UPDATE_SOURCE_PATH)
  return {
    update_sources: normalizeUpdateSources(payload),
    updated_at: typeof payload?.updated_at === 'string' ? payload.updated_at : null,
    updated_by: typeof payload?.updated_by === 'string' ? payload.updated_by : null,
  }
}

// Core's 400, 403 and 429 messages reach the caller unchanged in error.message.
export async function saveUpdateSource(component, type, ref, { api = apiFetch } = {}) {
  if (!UPDATE_SOURCE_COMPONENTS.includes(component)) throw Object.assign(new Error('Unknown update component.'), { status: 0, payload: null, code: null })
  if (type !== 'release' && type !== 'branch') throw Object.assign(new Error('The source must be release or branch.'), { status: 0, payload: null, code: null })
  if (type === 'branch') {
    const check = validateBranchName(ref)
    if (!check.valid) throw Object.assign(new Error(check.message), { status: 0, payload: null, code: null })
  }
  const payload = await api(UPDATE_SOURCE_PATH, {
    method: 'PATCH',
    body: JSON.stringify({ component, type, ref: type === 'branch' ? ref : null }),
  })
  return {
    update_sources: normalizeUpdateSources(payload),
    updated_at: typeof payload?.updated_at === 'string' ? payload.updated_at : null,
    updated_by: typeof payload?.updated_by === 'string' ? payload.updated_by : null,
  }
}

// dirty: the draft differs from what is saved. valid: the draft can be saved.
export function sourceDraftState({ saved, draft } = {}) {
  const savedSource = normalizeSource(saved)
  const type = draft?.type === 'branch' ? 'branch' : 'release'
  const ref = type === 'branch' ? (typeof draft?.ref === 'string' ? draft.ref : '') : null
  const dirty = type !== savedSource.type || (type === 'branch' && ref !== savedSource.ref)
  if (type === 'release') return { dirty, valid: true, message: dirty ? 'Save to use this source.' : '' }
  const check = validateBranchName(ref)
  if (!check.valid) return { dirty, valid: false, message: check.message }
  return { dirty, valid: true, message: dirty ? 'Save to use this source.' : '' }
}

export function describeUpdateSource(source) {
  const normalized = normalizeSource(source)
  return normalized.type === 'branch' ? `BRANCH ${normalized.ref}` : 'RELEASE'
}

export const NOT_RECORDED_TEXT = 'Installed commit not recorded. The next install from a branch records it.'

// Turns online.branch into labels for the card. Differs means the commits
// differ. It does not mean the branch is newer. Core 1.17.3 adds basis
// ('commit' | 'version' | null), head_version and installed_version.
export function branchComparison(branch) {
  if (!branch || typeof branch !== 'object') return null
  let state = branch.state
  if (!['same', 'differs', 'unknown'].includes(state)) {
    state = branch.differs === true ? 'differs' : (branch.differs === false ? 'same' : 'unknown')
  }
  const basis = branch.basis === 'commit' || branch.basis === 'version' ? branch.basis : null
  const headVersion = branch.head_version || ''
  const installedVersion = branch.installed_version || ''
  const installedRecorded = Boolean(branch.installed_short || branch.installed_commit)
  const view = {
    state,
    basis,
    headShort: branch.head_short || '',
    headDate: branch.head_date || '',
    headVersion,
    installedVersion,
    installedRecorded,
    installedShort: branch.installed_short || 'Not recorded',
    installedNote: installedRecorded ? '' : NOT_RECORDED_TEXT,
  }
  if (state === 'same' || state === 'differs') {
    const same = state === 'same'
    const label = same ? 'SAME' : 'DIFFERS'
    const pillClass = same ? 'ok' : 'warn'
    if (basis === 'version') {
      return { ...view, label, pillClass, text: `Compared by VERSION (branch head ${headVersion || 'unknown'}, installed ${installedVersion || 'unknown'}). A VERSION match does not prove the commits are equal.` }
    }
    return {
      ...view, label, pillClass,
      text: same ? 'The installed build is the current head of this branch.' : 'The installed commit differs from the branch head. That does not mean the branch is newer.',
    }
  }
  const text = !installedRecorded && 'basis' in branch && basis === null
    ? `${NOT_RECORDED_TEXT} The branch VERSION could not be compared.`
    : NOT_RECORDED_TEXT
  return { ...view, label: 'UNKNOWN', pillClass: '', text }
}

// What the card headlines. It follows the SAVED source, never the shape of the
// online payload: a branch source ignores latest_release entirely.
export function discoveredVersion({ saved, online, sourcesSupported } = {}) {
  const source = sourcesSupported ? normalizeSource(saved) : { ...RELEASE }
  const result = online && typeof online === 'object' ? online : null
  if (source.type === 'branch') {
    const same = result && result.source?.type === 'branch' && result.source?.ref === source.ref
    const checked = same ? result : null
    const comparison = branchComparison(checked?.branch)
    return {
      kind: 'branch',
      ref: source.ref,
      checked: Boolean(comparison),
      headShort: comparison?.headShort || '',
      headDate: comparison?.headDate || '',
      comparison,
      branchError: checked?.branch_error || '',
    }
  }
  const latest = result?.latest_release
  if (latest && typeof latest === 'object' && latest.tag) {
    return { kind: 'release', tag: latest.tag, trust: latest.release_trust || null, acceptance: latest.release_trust?.acceptance_policy || null, error: result.release_error || '' }
  }
  return { kind: 'none', error: result?.release_error || '' }
}

// First 7 characters of a hex commit id, or '' when there is none.
export function shortCommit(commit) {
  return typeof commit === 'string' && /^[0-9a-f]{7,64}$/i.test(commit.trim()) ? commit.trim().slice(0, 7).toLowerCase() : ''
}

// Label for the Source cell of a staged package, from preview.source:
// "branch dev · 1a2b3c4", "release v0.12.82 · 9f8e7d6", or "offline".
export function describeStageSource(source) {
  if (!source || typeof source !== 'object' || !source.type) return 'offline'
  const head = [String(source.type)]
  if (typeof source.ref === 'string' && source.ref) head.push(source.ref)
  const commit = shortCommit(source.commit)
  return commit ? `${head.join(' ')} · ${commit}` : head.join(' ')
}

// Compares the source the page asked Core to stage with the source Core says the
// package came from. requested: { type, ref, oneOff } or null (an offline file).
// A release matches on type alone: its preview ref is the tag, not a name we sent.
// Only a mismatch blocks Install. A one-off Advanced stage is allowed with a warning.
export function stageSourceCheck({ requested, preview, saved } = {}) {
  const source = preview && typeof preview === 'object' ? preview.source : null
  if (!requested) {
    return source && source.type
      ? { state: 'unchecked', blocked: false, message: '' }
      : { state: 'offline', blocked: false, message: '' }
  }
  if (!source || !source.type) {
    return { state: 'unchecked', blocked: false, message: 'Core did not report where this package came from.' }
  }
  const asked = requested.type === 'branch' ? { type: 'branch', ref: requested.ref || '' } : { type: 'release', ref: null }
  const sameSource = (a, b) => a.type === b.type && (a.type !== 'branch' || a.ref === b.ref)
  const got = source.type === 'branch' ? { type: 'branch', ref: typeof source.ref === 'string' ? source.ref : '' } : { type: String(source.type), ref: null }
  if (!sameSource(asked, got)) {
    return {
      state: 'mismatch',
      blocked: true,
      message: `This package came from ${describeStageSource(source)}, not the ${describeUpdateSource(asked).toLowerCase()} source this page asked for. Discard it and stage again.`,
    }
  }
  if (requested.oneOff && !sameSource(asked, normalizeSource(saved))) {
    return { state: 'oneoff', blocked: false, message: `One-off source: not saved. Saved source is ${describeUpdateSource(saved)}.` }
  }
  return { state: 'match', blocked: false, message: '' }
}
