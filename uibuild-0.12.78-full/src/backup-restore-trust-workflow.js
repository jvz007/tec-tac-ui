export async function trustRecoverySignerWorkflow({
  backupRef,
  destinationId,
  signer,
}, {
  confirmTrust,
  startRecoverySignerTrust,
  pollTrustJob,
  revalidate,
}) {
  if (!backupRef || !destinationId || !signer) throw new Error('Recovery signer trust context is incomplete.')
  const fingerprint = String(signer.public_key_sha256 || '')
  const keyId = String(signer.key_id || '')
  if (!fingerprint || !keyId) throw new Error('Recovery signer identity is incomplete.')
  if (!confirmTrust({ keyId, fingerprint, signer })) return { cancelled: true }

  const queued = await startRecoverySignerTrust({ backupRef, destinationId, signer })
  if (!queued?.job_id) throw new Error('Recovery signer trust did not return a job id.')
  const job = await pollTrustJob(queued.job_id)
  if (job?.status !== 'succeeded') throw new Error(job?.error || 'Recovery signer trust failed.')
  await revalidate()
  return { cancelled: false, job }
}
