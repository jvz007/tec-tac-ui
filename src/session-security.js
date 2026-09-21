import { apiFetch, TACTICAL_SESSION_INVALID_EVENT } from './api'

const DEFAULT_HEARTBEAT_SECONDS = 60
const MIN_HEARTBEAT_SECONDS = 30
const MAX_HEARTBEAT_SECONDS = 3600
const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'touchstart', 'scroll']

let running = false
let dirty = false
let timer = null
let heartbeatSeconds = DEFAULT_HEARTBEAT_SECONDS
let lastSentAt = 0
let configured = false

function normalizeHeartbeat(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return DEFAULT_HEARTBEAT_SECONDS
  return Math.min(MAX_HEARTBEAT_SECONDS, Math.max(MIN_HEARTBEAT_SECONDS, Math.floor(number)))
}

function markActivity() {
  if (!running) return
  dirty = true
  void maybeSendActivity()
}

async function maybeSendActivity({ force = false } = {}) {
  if (!running || !dirty) return false
  const now = Date.now()
  const intervalMs = heartbeatSeconds * 1000
  if (!force && lastSentAt && now - lastSentAt < intervalMs) return false

  // Clear dirty before sending. If the user interacts while the request is in
  // flight, markActivity() sets it again and the next interval preserves it.
  dirty = false
  try {
    await apiFetch('/api/tfd/session/activity/', { method: 'POST' })
    lastSentAt = Date.now()
    return true
  } catch (error) {
    // The shared authenticated API layer owns expired/revoked session handling.
    // For transient non-session errors, preserve the activity for a later retry.
    if (running && error?.status !== 401) dirty = true
    return false
  }
}

function scheduleTimer() {
  if (timer) window.clearInterval(timer)
  timer = window.setInterval(() => { void maybeSendActivity() }, Math.max(1000, heartbeatSeconds * 1000))
}

async function loadSessionPolicy() {
  const response = await apiFetch('/api/tfd/session/current/')
  heartbeatSeconds = normalizeHeartbeat(response?.policy?.activity_heartbeat_seconds)
  configured = true
  scheduleTimer()
  return response
}

function addListeners() {
  for (const name of ACTIVITY_EVENTS) {
    window.addEventListener(name, markActivity, { passive: true })
  }
}

function removeListeners() {
  for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, markActivity)
}

function onSessionInvalid() {
  stopSessionActivityTracking()
}

export async function startSessionActivityTracking() {
  if (running) return
  running = true
  dirty = false
  lastSentAt = 0
  addListeners()
  window.addEventListener(TACTICAL_SESSION_INVALID_EVENT, onSessionInvalid)
  try {
    await loadSessionPolicy()
  } catch (error) {
    if (error?.status !== 401) {
      // Session policy lookup failure should not manufacture user activity.
      // Keep the tracker alive on the safe default so it can recover later.
      configured = false
      heartbeatSeconds = DEFAULT_HEARTBEAT_SECONDS
      scheduleTimer()
    }
  }
}

export function stopSessionActivityTracking() {
  if (!running && !timer) return
  running = false
  dirty = false
  configured = false
  lastSentAt = 0
  if (timer) window.clearInterval(timer)
  timer = null
  removeListeners()
  window.removeEventListener(TACTICAL_SESSION_INVALID_EVENT, onSessionInvalid)
}

export function sessionActivityState() {
  return {
    running,
    dirty,
    configured,
    heartbeat_seconds: heartbeatSeconds,
    last_sent_at: lastSentAt || null,
  }
}
