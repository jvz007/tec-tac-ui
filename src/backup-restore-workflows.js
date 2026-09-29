export async function validateRestoreWorkflow(
  { backupRef, destinationId, restoreMode },
  { startRestoreValidation, pollJob },
) {
  if (!backupRef || !destinationId || !restoreMode) throw new Error('A backup, destination and restore mode are required.')
  const queued = await startRestoreValidation({ backupRef, destinationId, restoreMode })
  if (!queued?.job_id) throw new Error('Restore validation did not return a job ID.')
  const job = await pollJob(queued.job_id)
  if (job?.status !== 'succeeded') throw new Error(job?.error || 'Restore validation failed.')
  const validation = job.result || null
  return {
    validation,
    validationJobId: validation?.ok ? String(job.job_id || queued.job_id || '') : '',
  }
}

export async function startRestoreWorkflow(
  { backupRef, destinationId, restoreMode, validationJobId },
  { startServerRestore, pollJob },
) {
  if (!backupRef || !destinationId || !restoreMode || !validationJobId) {
    throw new Error('A successful restore validation is required before restore.')
  }
  const queued = await startServerRestore({ backupRef, destinationId, restoreMode, validationJobId })
  if (!queued?.job_id) throw new Error('Restore did not return a job ID.')
  const job = await pollJob(queued.job_id)
  if (job?.status !== 'succeeded') throw new Error(job?.error || 'Restore failed.')
  return { queued, job }
}
