import { reactive } from 'vue'

const LEVELS = new Set(['info', 'success', 'warning', 'error'])
const DEFAULT_DURATION = { info: 6000, success: 6000, warning: 9000, error: 10000 }
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

function normalizeRoute(value) {
  if (value == null || String(value).trim() === '') return null
  const route = text(value, 500, 'notification action route')
  if (!route.startsWith('/') || route.startsWith('//') || /[\u0000-\u001f]/.test(route)) {
    throw new Error("notification action.route must be an internal Tec-Tac route beginning with '/'")
  }
  return route
}

function persistentId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

export function createNotificationService({ api, router } = {}) {
  const toasts = reactive([])
  const history = reactive({
    open: false,
    loaded: false,
    loading: false,
    error: '',
    filter: 'all',
    items: [],
    unreadCount: 0,
  })
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

    let action = null
    if (source.action != null) {
      const route = normalizeRoute(source.action.route)
      const handler = source.action.handler
      if (handler != null && typeof handler !== 'function') throw new Error('notification action.handler must be a function')
      if (!handler && !route) throw new Error('notification action requires handler or route')
      action = {
        label: text(source.action.label, MAX_ACTION_LABEL, 'notification action label'),
        handler: handler || null,
        route,
        closeOnClick: source.action.closeOnClick !== false,
      }
    }

    return {
      moduleId,
      level,
      title: source.title == null || String(source.title).trim() === '' ? null : text(source.title, MAX_TITLE, 'notification title'),
      message: text(source.message, MAX_MESSAGE, 'notification message'),
      duration: normalizeDuration(source.duration, level, source.sticky),
      dedupeKey: source.dedupeKey == null ? null : text(source.dedupeKey, 120, 'notification dedupeKey'),
      action,
      // Runtime-only metadata is intentionally not persisted. Modules may use it
      // for live handlers without accidentally placing secrets in notice history.
      metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
    }
  }

  function mergeHistoryNotice(notice) {
    if (!notice?.id || !history.loaded) return
    const index = history.items.findIndex((item) => item.id === notice.id)
    if (index >= 0) history.items.splice(index, 1, notice)
    else history.items.unshift(notice)
    history.items = history.items.slice(0, 100)
  }

  async function persist(toast) {
    if (typeof api !== 'function') return
    const signature = JSON.stringify([
      toast.moduleId, toast.level, toast.title || '', toast.message,
      toast.action?.route || '', toast.action?.route ? toast.action.label : '',
    ])
    if (toast.lastPersistSignature === signature) return
    try {
      const payload = await api('/api/tfd/ui/notices/', {
        method: 'POST',
        body: JSON.stringify({
          client_id: toast.persistenceId,
          source: toast.moduleId,
          level: toast.level,
          title: toast.title || '',
          message: toast.message,
          action_label: toast.action?.route ? toast.action.label : '',
          action_route: toast.action?.route || '',
        }),
      })
      toast.lastPersistSignature = signature
      if (Number.isFinite(Number(payload?.unread_count))) history.unreadCount = Number(payload.unread_count)
      mergeHistoryNotice(payload?.notice)
    } catch (error) {
      // History persistence must never suppress the immediate notice or create a
      // recursive error toast. The shell surfaces retrieval errors in the drawer.
      if (history.open) history.error = error?.message || 'Notice history could not be updated.'
      console.warn('[TEC-TAC-UI] Notice history persistence failed.', error)
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
      void persist(existing)
      return existing.id
    }

    const toast = reactive({
      id: `toast-${++sequence}`,
      persistenceId: persistentId(),
      ...normalized,
      busy: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    toasts.push(toast)
    trimVisible()
    schedule(toast)
    void persist(toast)
    return toast.id
  }

  async function invoke(id) {
    const toast = toasts.find((item) => item.id === id)
    if (!toast?.action || toast.busy) return
    toast.busy = true
    clearTimer(id)
    try {
      if (toast.action.handler) await toast.action.handler({ notification: { ...toast, action: undefined } })
      else if (toast.action.route && router) await router.push(toast.action.route)
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
    for (const toast of [...toasts]) if (toast.moduleId === moduleId) dismiss(toast.id)
  }

  function setInitialUnreadCount(value) {
    const count = Number(value)
    history.unreadCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  }

  async function loadHistory({ filter = history.filter } = {}) {
    if (typeof api !== 'function') return
    history.filter = filter === 'unread' ? 'unread' : 'all'
    history.loading = true
    history.error = ''
    try {
      const query = new URLSearchParams({ state: history.filter, limit: '100' })
      const payload = await api(`/api/tfd/ui/notices/?${query.toString()}`)
      history.items = Array.isArray(payload?.notices) ? payload.notices : []
      history.unreadCount = Number(payload?.unread_count || 0)
      history.loaded = true
    } catch (error) {
      history.error = error?.message || 'Notice history could not be loaded.'
    } finally {
      history.loading = false
    }
  }

  async function openHistory() {
    history.open = true
    await loadHistory()
  }
  function closeHistory() { history.open = false }

  async function markRead(notice) {
    if (!notice?.id || notice.read || typeof api !== 'function') return
    try {
      const payload = await api(`/api/tfd/ui/notices/${encodeURIComponent(notice.id)}/read/`, { method: 'POST' })
      notice.read = true
      notice.read_at = new Date().toISOString()
      history.unreadCount = Number(payload?.unread_count || 0)
      if (history.filter === 'unread') history.items = history.items.filter((item) => item.id !== notice.id)
    } catch (error) {
      history.error = error?.message || 'Notice could not be marked read.'
    }
  }

  async function markAllRead() {
    if (typeof api !== 'function') return
    try {
      await api('/api/tfd/ui/notices/read-all/', { method: 'POST' })
      history.unreadCount = 0
      if (history.filter === 'unread') history.items = []
      else history.items.forEach((item) => { item.read = true; item.read_at ||= new Date().toISOString() })
    } catch (error) {
      history.error = error?.message || 'Notices could not be marked read.'
    }
  }

  async function clearRead() {
    if (typeof api !== 'function') return
    try {
      const payload = await api('/api/tfd/ui/notices/clear-read/', { method: 'DELETE' })
      history.items = history.items.filter((item) => !item.read)
      history.unreadCount = Number(payload?.unread_count || history.unreadCount || 0)
    } catch (error) {
      history.error = error?.message || 'Read notices could not be cleared.'
    }
  }

  async function activateHistoryNotice(notice) {
    await markRead(notice)
    if (notice?.action?.route && router) {
      history.open = false
      await router.push(notice.action.route)
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

  return Object.freeze({
    toasts, history, dismiss, invoke, forModule, setInitialUnreadCount,
    loadHistory, openHistory, closeHistory, markRead, markAllRead, clearRead, activateHistoryNotice,
  })
}
