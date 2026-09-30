export function restoreConfirmationState(validation) {
  const report = validation && typeof validation === 'object' ? validation : null
  const transition = report?.version_transition && typeof report.version_transition === 'object' ? report.version_transition : null
  const source = report?.source_identity && typeof report.source_identity === 'object'
    ? report.source_identity
    : (report?.recovery_signer && typeof report.recovery_signer === 'object' ? report.recovery_signer : null)
  const integrity = report?.archive_verification && typeof report.archive_verification === 'object' ? report.archive_verification : null
  const downgrade = transition?.is_core_downgrade === true
  const restoredVersion = String(transition?.restored_core_version || source?.core_version || '').trim()
  const sourceServerName = String(source?.server_name || '').trim()
  const installationId = String(source?.installation_id || '').trim()
  const createdAt = String(source?.created_at || source?.signed_at || '').trim()
  const sourceCoreVersion = String(source?.core_version || restoredVersion || '').trim()
  const integrityStatus = String(integrity?.status || '').trim()
  const integrityVerified = integrityStatus === 'verified'
  const integrityNotVerified = integrityStatus === 'not_verified'
  const integrityLabel = integrityVerified ? 'SHA-256 verified' : (integrityNotVerified ? 'Not verified' : 'Unknown')
  const downgradeHeadline = downgrade ? `This puts Core back to ${restoredVersion || 'an older version'}.` : ''
  const notice = downgrade ? String(transition?.notice || downgradeHeadline) : ''
  return {
    ready: report?.ok === true,
    source,
    integrity,
    transition,
    downgrade,
    restoredVersion,
    downgradeNotice: notice,
    review: {
      sourceServerName,
      installationId,
      createdAt,
      sourceCoreVersion,
      integrityStatus,
      integrityVerified,
      integrityNotVerified,
      integrityLabel,
      downgradeHeadline,
      transitionLabel: transition
        ? `Core ${transition.current_core_version || 'current'} → ${transition.restored_core_version || 'backup version'}`
        : '',
    },
  }
}

export function restoreReviewRows(state) {
  const review = state?.review || {}
  return [
    { id: 'server_name', label: 'Server name', value: review.sourceServerName || '—', hint: 'source server' },
    { id: 'installation_id', label: 'Installation ID', value: review.installationId || '—', hint: 'source installation' },
    { id: 'created_at', label: 'Backup date', value: review.createdAt || '—', hint: 'bundle creation time' },
    { id: 'core_version', label: 'Core version', value: review.sourceCoreVersion || '—', hint: 'backup Core version' },
    { id: 'integrity', label: 'Integrity', value: review.integrityLabel || 'Unknown', hint: review.integrityVerified ? 'adjacent SHA-256 matched' : 'no adjacent SHA-256 proof' },
  ]
}

export function canStartRestore({ confirmationState, selectedBackup, selectedDestination, busy, validationJobId }) {
  return Boolean(confirmationState?.ready && selectedBackup && selectedDestination && !busy && String(validationJobId || '').trim())
}
