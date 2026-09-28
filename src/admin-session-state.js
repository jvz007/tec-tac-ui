export function createLatestRequestGate() {
  let activeRequestId = 0
  return {
    begin() {
      activeRequestId += 1
      return activeRequestId
    },
    isCurrent(requestId) {
      return Number(requestId) === activeRequestId
    },
    current() {
      return activeRequestId
    },
  }
}

export function revokeSessionPrompt(row = {}) {
  const username = row.username || 'this user'
  if (row.current === true) {
    return `Revoke your CURRENT login session for ${username}? You will be signed out immediately, and this session will stop authenticating through Tactical and Tec-Tac.`
  }
  return `Revoke this active login session for ${username}? The session will stop authenticating immediately.`
}

export function revokeUserSessionsPrompt(row = {}) {
  const username = row.username || 'this user'
  if (row.current === true) {
    return `Revoke ALL active login sessions for ${username}? This includes your CURRENT session, so you will be signed out immediately.`
  }
  return `Revoke ALL active login sessions for ${username}? Every active session for this account will stop authenticating immediately.`
}
