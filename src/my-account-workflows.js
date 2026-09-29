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
  if (confirmReset && !confirmReset()) return { cancelled: true }
  await resetMyTotp(password, code)
  clearSession?.()
  reload?.()
  return { reset: true }
}

export async function revokeOthersWorkflow({ revokeMyOtherSessions, confirmRevoke }) {
  if (confirmRevoke && !confirmRevoke()) return { cancelled: true }
  const result = await revokeMyOtherSessions()
  return { message: `${Number(result?.revoked || 0)} other session(s) signed out.` }
}

export async function saveTacticalUiWorkflow(tactical, { saveMyTacticalUiPreferences }) {
  const response = await saveMyTacticalUiPreferences({
    agent_dblclick_action: tactical?.agent_dblclick_action,
    url_action_id: tactical?.url_action_id || null,
  })
  return { preferences: response?.preferences || null, message: 'Tactical UI preferences saved.' }
}
