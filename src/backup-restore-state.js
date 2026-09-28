export function restoreConfirmationState(validation) {
  const report = validation && typeof validation === 'object' ? validation : null
  const transition = report?.version_transition && typeof report.version_transition === 'object' ? report.version_transition : null
  const signer = report?.recovery_signer && typeof report.recovery_signer === 'object' ? report.recovery_signer : null
  const downgrade = transition?.is_core_downgrade === true
  const restoredVersion = String(transition?.restored_core_version || '').trim()
  const sourceServerName = String(signer?.server_name || '').trim()
  const installationId = String(signer?.installation_id || '').trim()
  const signerKeyId = String(signer?.key_id || '').trim()
  const signerFingerprint = String(signer?.public_key_sha256 || '').trim()
  const downgradeHeadline = downgrade
    ? `This puts Core back to ${restoredVersion || 'an older version'}.`
    : ''
  const notice = downgrade
    ? String(transition?.notice || downgradeHeadline)
    : ''
  return {
    ready: report?.ok === true,
    signer,
    transition,
    downgrade,
    restoredVersion,
    downgradeNotice: notice,
    review: {
      sourceServerName,
      installationId,
      signerKeyId,
      signerFingerprint,
      downgradeHeadline,
      transitionLabel: transition
        ? `Core ${transition.current_core_version || 'current'} → ${transition.restored_core_version || 'backup version'}`
        : '',
    },
  }
}
