// 0.13.4 (Core 1.18.45): helpers for the result check page (/results/:checkId). Pure functions plus one small controller that holds the
// page state and drops a late answer from an earlier page or check. The page never shows output text: Core does not send any.
import { createKeyedLatestRequestGate } from './latest-request-gate.js'

export const RESULT_PAGE_SIZE = 50
export const NOT_FOUND_SENTENCE = "We can't find these results. They may belong to someone else, or they may be older than 30 days."
export const NETWORK_SENTENCE = "We can't reach Tec-Tac right now. Check your connection, then try again."

const STATES = {
  done: { label: 'Done', tone: 'ok' },
  failed: { label: 'Failed', tone: 'danger' },
  offline: { label: 'Offline', tone: 'warn' },
  running: { label: 'Still running', tone: 'warn' },
  no_result: { label: 'No result', tone: 'warn' },
}

export function stateLabel(state) {
  return STATES[state]?.label || String(state ?? '')
}

export function stateTone(state) {
  return STATES[state]?.tone || ''
}

export function exitCodeText(value) {
  return value === null || value === undefined || value === '' ? '\u2014' : String(value)
}

export function rowsFromItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    key: String(item.endpoint_id),
    endpoint: item.hostname ? String(item.hostname) : String(item.endpoint_id ?? ''),
    state: item.state,
    stateLabel: stateLabel(item.state),
    tone: stateTone(item.state),
    exitCode: exitCodeText(item.exit_code),
  }))
}

export function countPills(summary) {
  const s = summary || {}
  return [
    { id: 'done', label: 'Done', value: Number(s.done || 0), tone: 'ok' },
    { id: 'failed', label: 'Failed', value: Number(s.failed || 0), tone: 'danger' },
    { id: 'offline', label: 'Offline', value: Number(s.offline || 0), tone: 'warn' },
    { id: 'running', label: 'Still running', value: Number(s.running || 0), tone: 'warn' },
    { id: 'no_result', label: 'No result', value: Number(s.no_result || 0), tone: 'warn' },
  ]
}

export function rangeText({ page = 1, pageSize = RESULT_PAGE_SIZE, shown = 0, total = 0 } = {}) {
  if (!shown || !total) return '0 endpoints'
  const first = (Number(page) - 1) * Number(pageSize) + 1
  return `${first} to ${first + shown - 1} of ${total}`
}

export function errorSentence(error) {
  const status = Number(error?.status || 0)
  if (status === 404) return NOT_FOUND_SENTENCE
  if (!status) return NETWORK_SENTENCE
  return String(error?.message || '').trim() || 'Core could not read these results. Try again.'
}

export function newResultCheckState() {
  return { loading: false, error: '', notFound: false, answer: null, page: 1 }
}

// fetchPage(checkId, { page, pageSize }) returns Core's answer. state may be a reactive object.
export function createResultCheckController({ fetchPage, state = newResultCheckState(), pageSize = RESULT_PAGE_SIZE } = {}) {
  const gate = createKeyedLatestRequestGate(['result'])
  let checkId = ''
  async function load(id, page = 1) {
    if (String(id) !== checkId) state.answer = null
    checkId = String(id)
    state.page = page
    state.loading = true
    state.error = ''
    state.notFound = false
    const ticket = gate.begin('result')
    try {
      const answer = await fetchPage(checkId, { page, pageSize })
      if (!gate.isCurrent('result', ticket)) return
      state.answer = answer
    } catch (error) {
      if (!gate.isCurrent('result', ticket)) return
      state.answer = null
      if (Number(error?.status) === 404) state.notFound = true
      state.error = errorSentence(error)
    } finally {
      if (gate.isCurrent('result', ticket)) state.loading = false
    }
  }
  return {
    state,
    load,
    refresh: () => load(checkId, state.page),
    next: () => (state.answer?.next_page ? load(checkId, Number(state.answer.next_page)) : Promise.resolve()),
    previous: () => (state.page > 1 ? load(checkId, state.page - 1) : Promise.resolve()),
    dispose: () => gate.invalidate('result'),
  }
}
