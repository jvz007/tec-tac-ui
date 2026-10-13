import { reactive } from 'vue'

const LEVELS = new Set(['info', 'success', 'warning', 'error'])
const DEFAULT_DURATION = { info: 6000, success: 6000, warning: 9000, error: 10000 }
const MAX_VISIBLE = 5
const MAX_MESSAGE = 1000
const MAX_TITLE = 120
const MAX_ACTION_LABEL = 60
// Core creates some notices itself (module job failures, Core 1.17.14). This page checks for new unread ones.
const SERVER_NOTICE_POLL_MS = 30000
const MAX_KNOWN_NOTICES = 1000
// 0.12.101: per person, in this browser. The toasted list holds notice ids only; the checked key holds a time in milliseconds.
// Never a token and never notice text.
const TOASTED_KEY_PREFIX = 'tec_tac_notices_toasted:'
const CHECKED_KEY_PREFIX = 'tec_tac_notices_checked:'
const MAX_STORED_TOASTED = 500

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

// Browser storage (0.12.101). Every access is guarded: missing or throwing storage leaves the page on its memory alone.
function storageArea() {
  try {
    return typeof window !== 'undefined' && window?.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

function storageRead(key) {
  try {
    const area = storageArea()
    return area ? area.getItem(key) : null
  } catch {
    return null
  }
}

function storageWrite(key, value) {
  try {
    const area = storageArea()
    if (!area) return
    area.setItem(key, value)
  } catch {
    // Storage refused the write. The ids stay in memory for this page.
  }
}

function parseIdList(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id) : []
  } catch {
    return []
  }
}

function personKeyText(value) {
  if (value == null) return ''
  const key = String(value).trim()
  return key && key.length <= 64 ? key : ''
}

function readCheckedAt(person) {
  if (!person) return null
  const raw = storageRead(`${CHECKED_KEY_PREFIX}${person}`)
  const value = raw == null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

function writeCheckedAt(person, at) {
  if (person) storageWrite(`${CHECKED_KEY_PREFIX}${person}`, String(at))
}

// Core's created_at is the sweep time, not the time the job failed. A row without a readable time is not new.
function createdSince(createdAt, checkedAt) {
  if (checkedAt == null) return false
  const created = Date.parse(String(createdAt || ''))
  return Number.isFinite(created) && created > checkedAt
}

export function createNotificationService({ api, router, userKey } = {}) {
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
  // Notice ids this page has seen. The first poll only records the backlog, so old notices never toast again.
  const knownNoticeIds = new Set()
  let persistsInFlight = 0
  let serverPollTimer = null
  let serverPollBusy = false
  let serverPollSeeded = false
  // 0.12.101: ids this page has toasted for the current person. The browser's stored list is read as well (isToasted).
  const toastedMemory = new Set()
  let seenPerson = null

  function currentPerson() {
    try {
      return personKeyText(typeof userKey === 'function' ? userKey() : null)
    } catch {
      return ''
    }
  }

  function isToasted(person, id) {
    if (toastedMemory.has(id)) return true
    return !!person && parseIdList(storageRead(`${TOASTED_KEY_PREFIX}${person}`)).includes(id)
  }

  function markToasted(person, id) {
    toastedMemory.add(id)
    while (toastedMemory.size > MAX_KNOWN_NOTICES) toastedMemory.delete(toastedMemory.values().next().value)
    if (!person) return
    const key = `${TOASTED_KEY_PREFIX}${person}`
    const stored = parseIdList(storageRead(key)).filter((item) => item !== id)
    storageWrite(key, JSON.stringify([...stored, id].slice(-MAX_STORED_TOASTED)))
  }

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

  function rememberNotice(id) {
    const key = String(id || '')
    if (!key) return
    knownNoticeIds.add(key)
    while (knownNoticeIds.size > MAX_KNOWN_NOTICES) knownNoticeIds.delete(knownNoticeIds.values().next().value)
  }

  async function persist(toast) {
    if (typeof api !== 'function') return
    const signature = JSON.stringify([
      toast.moduleId, toast.level, toast.title || '', toast.message,
      toast.action?.route || '', toast.action?.route ? toast.action.label : '',
    ])
    if (toast.lastPersistSignature === signature) return
    persistsInFlight += 1
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
      // A notice this page stored itself is never toasted again when the poll finds it.
      rememberNotice(payload?.notice?.id)
      if (Number.isFinite(Number(payload?.unread_count))) history.unreadCount = Number(payload.unread_count)
      mergeHistoryNotice(payload?.notice)
    } catch (error) {
      // History persistence must never suppress the immediate notice or create a
      // recursive error toast. The shell surfaces retrieval errors in the drawer.
      if (history.open) history.error = error?.message || 'Notice history could not be updated.'
      console.warn('[TEC-TAC-UI] Notice history persistence failed.', error)
    } finally {
      persistsInFlight -= 1
    }
  }

  function showForModule(moduleId, input, forcedLevel = null, persistNotice = true) {
    const normalized = normalize(moduleId, input, forcedLevel)
    const existing = normalized.dedupeKey
      ? toasts.find((item) => item.moduleId === moduleId && item.dedupeKey === normalized.dedupeKey)
      : null

    if (existing) {
      Object.assign(existing, normalized, { busy: false, updatedAt: Date.now() })
      schedule(existing)
      if (persistNotice) void persist(existing)
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
    if (persistNotice) void persist(toast)
    return toast.id
  }

  // A row Core stored shows as a toast. It is not posted back: the row already lives in Core.
  function showServerNotice(row) {
    const level = String(row.level || '').trim().toLowerCase()
    // A link that is not an internal route is dropped; the message still shows.
    const route = typeof row.action?.route === 'string' ? row.action.route.trim() : ''
    const internal = route.startsWith('/') && !route.startsWith('//') && !/[\u0000-\u001f]/.test(route)
    const id = showForModule(String(row.source || 'core').trim() || 'core', {
      level: LEVELS.has(level) ? level : 'info',
      title: row.title || undefined,
      message: row.message,
      action: internal ? { label: row.action?.label || 'Open', route } : undefined,
    }, null, false)
    // The Core row id rides on the toast, so its × and its action can mark that row read (0.12.101).
    const toast = toasts.find((item) => item.id === id)
    if (toast) toast.serverNoticeId = String(row.id)
    return id
  }

  // One check for unread notices Core stored. A notice toasts once per person in this browser. The first check of a page
  // load toasts only a notice created since the last check; older rows are only recorded.
  async function pollServerNotices() {
    if (typeof api !== 'function' || serverPollBusy || persistsInFlight > 0) return
    serverPollBusy = true
    const person = currentPerson()
    // A change of person starts over: the page forgets what it knew and the next check is a first check (0.12.101).
    if (person !== seenPerson) {
      seenPerson = person
      knownNoticeIds.clear()
      toastedMemory.clear()
      serverPollSeeded = false
    }
    const startedAt = Date.now()
    try {
      const payload = await api('/api/tfd/ui/notices/?state=unread&limit=100')
      const rows = Array.isArray(payload?.notices) ? payload.notices : []
      const firstCheck = !serverPollSeeded
      // The first check reads the time of the last check before this check writes its own.
      const checkedAt = firstCheck ? readCheckedAt(person) : null
      serverPollSeeded = true
      for (const row of rows) {
        const id = String(row?.id || '')
        if (!id || knownNoticeIds.has(id)) continue
        rememberNotice(id)
        if (isToasted(person, id)) continue
        if (firstCheck && !createdSince(row.created_at, checkedAt)) continue
        try {
          showServerNotice(row)
          markToasted(person, id)
        } catch (error) {
          console.warn('[TEC-TAC-UI] A notice from Core could not be shown.', error)
        }
      }
      writeCheckedAt(person, startedAt)
      if (Number.isFinite(Number(payload?.unread_count))) history.unreadCount = Number(payload.unread_count)
    } catch (error) {
      console.warn('[TEC-TAC-UI] Notices from Core could not be checked.', error)
    } finally {
      serverPollBusy = false
    }
  }

  // Starting or stopping the timer does not reset the first-check state: a restart neither re-toasts known rows nor
  // swallows a new one (0.12.101). Only a change of person resets it.
  function startServerNoticePolling() {
    if (serverPollTimer || typeof api !== 'function') return
    serverPollTimer = setInterval(() => { void pollServerNotices() }, SERVER_NOTICE_POLL_MS)
    void pollServerNotices()
  }

  function stopServerNoticePolling() {
    if (serverPollTimer) clearInterval(serverPollTimer)
    serverPollTimer = null
  }

  async function invoke(id) {
    const toast = toasts.find((item) => item.id === id)
    if (!toast?.action || toast.busy) return
    toast.busy = true
    clearTimer(id)
    // Using the notice's action reads the notice (0.12.101). A failed mark-read only warns; the toast does not return.
    if (toast.serverNoticeId) void markRead(toast.serverNoticeId)
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

  // Takes a notice row (the drawer) or its id (0.12.101). History and the unread count move together.
  async function markRead(target) {
    const notice = target && typeof target === 'object' ? target : null
    const id = String(notice ? (notice.id ?? '') : (target ?? ''))
    if (!id || notice?.read || typeof api !== 'function') return
    try {
      const payload = await api(`/api/tfd/ui/notices/${encodeURIComponent(id)}/read/`, { method: 'POST' })
      const listed = notice || history.items.find((item) => item.id === id)
      if (listed) {
        listed.read = true
        listed.read_at = new Date().toISOString()
      }
      history.unreadCount = Number(payload?.unread_count || 0)
      if (history.filter === 'unread') history.items = history.items.filter((item) => item.id !== id)
    } catch (error) {
      console.warn('[TEC-TAC-UI] A notice could not be marked read.', error)
      if (history.open) history.error = error?.message || 'Notice could not be marked read.'
    }
  }

  // The person closed a Core notice's toast with the × (0.12.101): the notice is read. Timer expiry, trimming and a
  // module's clear do not do this; the notice stays in the bell.
  async function dismissByPerson(id) {
    const toast = toasts.find((item) => item.id === id)
    const noticeId = toast?.serverNoticeId || ''
    dismiss(id)
    if (noticeId) await markRead(noticeId)
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
    loadHistory, openHistory, closeHistory, markRead, dismissByPerson, markAllRead, clearRead, activateHistoryNotice,
    pollServerNotices, startServerNoticePolling, stopServerNoticePolling,
  })
}
