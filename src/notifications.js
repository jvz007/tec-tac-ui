import { reactive } from 'vue'

const LEVELS = new Set(['info', 'success', 'warning', 'error'])
const DEFAULT_DURATION = {
  info: 6000,
  success: 6000,
  warning: 9000,
  error: 10000,
}
const MAX_VISIBLE = 5
const MAX_MESSAGE = 1000
const MAX_TITLE = 120
const MAX_ACTION_LABEL = 60

function text(value, max, label) {
  const result = String(value ?? '').trim()
  if (!result) throw new Error(`${label} is required`)
  if (result.length > max) throw new Error(`${label} exceeds ${max} characters`)
  return result
}

function normalizeDuration(value, level, sticky) {
  if (sticky === true) return 0
  if (value == null) return DEFAULT_DURATION[level]
  const duration = Number(value)
  if (!Number.isFinite(duration) || duration < 0 || duration > 60000) {
    throw new Error('notification duration must be between 0 and 60000 milliseconds')
  }
  return Math.round(duration)
}

export function createNotificationService() {
  const toasts = reactive([])
  const timers = new Map()
  let sequence = 0

  function clearTimer(id) {
    const timer = timers.get(id)
    if (timer) window.clearTimeout(timer)
    timers.delete(id)
  }

  function dismiss(id) {
    clearTimer(id)
    const index = toasts.findIndex((item) => item.id === id)
    if (index >= 0) toasts.splice(index, 1)
  }

  function schedule(toast) {
    clearTimer(toast.id)
    if (!toast.duration) return
    timers.set(toast.id, window.setTimeout(() => dismiss(toast.id), toast.duration))
  }

  function trimVisible() {
    while (toasts.length > MAX_VISIBLE) {
      const removable = toasts.find((item) => item.duration > 0 && !item.busy) || toasts[0]
      dismiss(removable.id)
    }
  }

  function normalize(moduleId, input, forcedLevel = null) {
    const source = typeof input === 'string' ? { message: input } : { ...(input || {}) }
    const level = forcedLevel || String(source.level || 'info').trim().toLowerCase()
    if (!LEVELS.has(level)) throw new Error(`unsupported notification level: ${level}`)

    const action = source.action == null ? null : {
      label: text(source.action.label, MAX_ACTION_LABEL, 'notification action label'),
      handler: source.action.handler,
      closeOnClick: source.action.closeOnClick !== false,
    }
    if (action && typeof action.handler !== 'function') {
      throw new Error('notification action.handler must be a function')
    }

    return {
      moduleId,
      level,
      title: source.title == null || String(source.title).trim() === '' ? null : text(source.title, MAX_TITLE, 'notification title'),
      message: text(source.message, MAX_MESSAGE, 'notification message'),
      duration: normalizeDuration(source.duration, level, source.sticky),
      dedupeKey: source.dedupeKey == null ? null : text(source.dedupeKey, 120, 'notification dedupeKey'),
      action,
      metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
    }
  }

  function showForModule(moduleId, input, forcedLevel = null) {
    const normalized = normalize(moduleId, input, forcedLevel)
    const existing = normalized.dedupeKey
      ? toasts.find((item) => item.moduleId === moduleId && item.dedupeKey === normalized.dedupeKey)
      : null

    if (existing) {
      Object.assign(existing, normalized, { busy: false, updatedAt: Date.now() })
      schedule(existing)
      return existing.id
    }

    const toast = reactive({
      id: `toast-${++sequence}`,
      ...normalized,
      busy: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    toasts.push(toast)
    trimVisible()
    schedule(toast)
    return toast.id
  }

  async function invoke(id) {
    const toast = toasts.find((item) => item.id === id)
    if (!toast?.action || toast.busy) return
    toast.busy = true
    clearTimer(id)
    try {
      await toast.action.handler({ notification: { ...toast, action: undefined } })
      if (toast.action.closeOnClick) dismiss(id)
      else {
        toast.busy = false
        schedule(toast)
      }
    } catch (error) {
      toast.busy = false
      schedule(toast)
      showForModule(toast.moduleId, {
        level: 'error',
        title: 'Action failed',
        message: error?.message || 'The notification action failed.',
        dedupeKey: `notification-action-error:${id}`,
      })
    }
  }

  function clearModule(moduleId) {
    for (const toast of [...toasts]) {
      if (toast.moduleId === moduleId) dismiss(toast.id)
    }
  }

  function forModule(moduleId) {
    const id = String(moduleId || '').trim()
    if (!id) throw new Error('module ID is required for notifications')
    return Object.freeze({
      show: (input) => showForModule(id, input),
      info: (message, options = {}) => showForModule(id, { ...options, message }, 'info'),
      success: (message, options = {}) => showForModule(id, { ...options, message }, 'success'),
      warning: (message, options = {}) => showForModule(id, { ...options, message }, 'warning'),
      error: (message, options = {}) => showForModule(id, { ...options, message }, 'error'),
      dismiss: (toastId) => {
        const toast = toasts.find((item) => item.id === toastId)
        if (toast?.moduleId === id) dismiss(toastId)
      },
      clear: () => clearModule(id),
    })
  }

  return Object.freeze({ toasts, dismiss, invoke, forModule })
}
