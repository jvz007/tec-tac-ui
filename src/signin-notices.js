// 0.12.110: pure decisions for the sign-in screen and the SSO return address. No DOM, no Vue, so tests can check behaviour.
import { CORE_SESSION_FAILURE_CODES, coreSessionFailureMessage } from './api.js'

// The same words the shell uses for a 401 without a Core reason (api.js invalidateTacticalSession).
export const SESSION_ENDED_DEFAULT_MESSAGE = 'Your Tactical session is no longer valid. Sign in again.'

// Tactical's own words for a failed provider return (ProviderCallback.vue in Tactical v1.5.2).
export const SSO_PROVIDER_ERROR_MESSAGE = 'There was an error logging into your provider'

// The line shown above the credentials form when Core signed the person out. Only a 401 counts; a first visit
// (no error), a startup failure or any other status shows nothing.
export function sessionEndedMessage(error) {
  if (!error || typeof error !== 'object' || error.status !== 401) return ''
  const code = typeof error.code === 'string' && CORE_SESSION_FAILURE_CODES.has(error.code) ? error.code : null
  return (code && coreSessionFailureMessage(code)) || SESSION_ENDED_DEFAULT_MESSAGE
}

// True when the SSO return address carries an `error` parameter, even an empty one. The hash query (route.query)
// is read first; the page query (window.location.search, for `/tec-tac/?error=...#/sso/callback`) is the fallback.
export function ssoCallbackError(routeQuery, locationSearch) {
  if (routeQuery && typeof routeQuery === 'object' && Object.prototype.hasOwnProperty.call(routeQuery, 'error')) return true
  if (typeof locationSearch === 'string' && new URLSearchParams(locationSearch).has('error')) return true
  return false
}
