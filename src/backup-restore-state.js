export function restoreConfirmationState(validation) {
  const report = validation && typeof validation === 'object' ? validation : null
  const transition = report?.version_transition && typeof report.version_transition === 'object' ? report.version_transition : null
  const signer = report?.recovery_signer && typeof report.recovery_signer === 'object' ? report.recovery_signer : null
  const downgrade = transition?.is_core_downgrade === true
  const restoredVersion = String(transition?.restored_core_version || '').trim()
  const notice = downgrade
    ? String(transition?.notice || (restoredVersion ? `This restore puts Core back to ${restoredVersion}.` : 'This restore puts Core back to an older version.'))
    : ''
  return {
    ready: report?.ok === true,
    signer,
    transition,
    downgrade,
    restoredVersion,
    downgradeNotice: notice,
  }
}
