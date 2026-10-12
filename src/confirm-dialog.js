import { inject, reactive } from 'vue'

// The one shell confirmation (0.12.96): a plain question with Yes and No. It names the target and, for a bulk
// action, the number of endpoints. It has no input field, so nobody types a name, a hostname or a number.
// Text is shown as text only. The service answers a Promise of true (Yes) or false (No, Escape, backdrop).

export const CONFIRM_LIMITS = Object.freeze({ question: 300, target: 200, noun: 30, detail: 400, label: 24 })
export const CONFIRM_TITLE = 'Are you sure?'

// Tab, line breaks and other control characters, zero-width and line-separator characters. A line break or tab
// becomes a space; the rest is removed.
const BREAKS = /[\t\n\r\u2028\u2029]+/g
const STRIP = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g

export function cleanConfirmText(value, max) {
  if (value == null || typeof value === 'object' || typeof value === 'function') return ''
  const text = String(value).replace(BREAKS, ' ').replace(STRIP, '').replace(/ {2,}/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

// Returns the cleaned options, or throws a TypeError when there is no question. A text longer than its limit is
// cut. A count that is not a whole number of at least 1 is dropped.
export function cleanConfirmOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('confirm(options) requires an options object with a question')
  const question = cleanConfirmText(options.question, CONFIRM_LIMITS.question)
  if (!question) throw new TypeError('confirm(options) requires a question')
  const count = Number.isInteger(options.count) && options.count >= 1 ? options.count : null
  return {
    question,
    target: cleanConfirmText(options.target, CONFIRM_LIMITS.target),
    count,
    noun: cleanConfirmText(options.noun, CONFIRM_LIMITS.noun) || 'endpoints',
    detail: cleanConfirmText(options.detail, CONFIRM_LIMITS.detail),
    danger: options.danger === true,
    yesLabel: cleanConfirmText(options.yesLabel, CONFIRM_LIMITS.label) || 'Yes',
    noLabel: cleanConfirmText(options.noLabel, CONFIRM_LIMITS.label) || 'No',
  }
}

// The count line: "This affects 340 endpoints." One endpoint reads singular for the default noun.
export function confirmCountLine(count, noun = 'endpoints') {
  if (!Number.isInteger(count) || count < 1) return ''
  const word = count === 1 && noun === 'endpoints' ? 'endpoint' : noun
  return `This affects ${count.toLocaleString('en-ZA').split(String.fromCharCode(160)).join(' ')} ${word}.`
}

export function createConfirmService() {
  const state = reactive({ current: null, pending: 0 })
  const queue = []
  let nextId = 1
  let active = null

  function showNext() {
    active = queue.shift() || null
    state.current = active ? { id: active.id, ...active.options, askedBy: active.askedBy } : null
    state.pending = queue.length
  }

  // askedBy is the module id the shell shows as "Asked by <id>"; empty for Core's own pages.
  async function confirm(options, askedBy = '') {
    const cleaned = cleanConfirmOptions(options)
    return new Promise((resolve) => {
      queue.push({ id: nextId++, options: cleaned, askedBy: cleanConfirmText(askedBy, 80), resolve })
      if (!active) showNext()
      else state.pending = queue.length
    })
  }

  function answer(value) {
    const done = active
    if (!done) return false
    showNext()
    done.resolve(value === true)
    return true
  }

  // Everything open or waiting answers No (sign-out).
  function cancelAll() {
    const waiting = queue.splice(0)
    const done = active
    active = null
    state.current = null
    state.pending = 0
    if (done) done.resolve(false)
    for (const item of waiting) item.resolve(false)
  }

  // A confirm bound to one module: the shell adds the "Asked by" line itself. isAbandoned refuses a call after a
  // failed or timed-out register().
  function bind(moduleId, { isAbandoned } = {}) {
    return function confirmForModule(options) {
      if (typeof isAbandoned === 'function' && isAbandoned()) {
        return Promise.reject(new Error(`module ${moduleId} was abandoned after a failed or timed-out register(); confirm() is refused`))
      }
      return confirm(options, moduleId)
    }
  }

  return Object.freeze({ state, confirm, answer, cancelAll, bind })
}

// For Core's own views. Without the service (a test, a stripped mount) the answer is No, never window.confirm.
export function useConfirm() {
  const service = inject('tecTacConfirm', null)
  return (options) => (service ? service.confirm(options) : Promise.resolve(false))
}
