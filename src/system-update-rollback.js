// 0.12.123 (Core 1.17.96 and 1.17.97): how a System Updates job shows its rollback. Pure and import-free; every string is text, cut to a
// sane length, never markup. The job itself stays failed with its own error line, because the update failed. Only a rollback that
// itself failed is red. A restored version with a verification warning is yellow, like a successful rollback. A status this build does
// not know is yellow with the word, so nothing unknown ever looks like a failure it cannot name.

const clip = (value, max) => {
  if (value == null || typeof value === 'object' || typeof value === 'function') return ''
  const out = String(value).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, ' ').replace(/ {2,}/g, ' ').trim()
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out
}
const list = (value) => (Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [])
  .map((x) => clip(x, 60)).filter(Boolean).slice(0, 12)

// Returns null (nothing to show) or { tone: 'warning' | 'denied', text, advice, detail, restart }.
export function rollbackNotice(rollback) {
  if (!rollback || typeof rollback !== 'object' || Array.isArray(rollback)) return null
  if (rollback.performed !== true) return null
  const status = clip(rollback.status, 40).toLowerCase()
  if (status === 'not-required') return null
  const version = clip(rollback.version, 60)
  if (status === 'succeeded') {
    return { tone: 'warning', text: `Rollback succeeded${version ? ` · restored ${version}` : ''}`, advice: '', detail: '', restart: '' }
  }
  if (status === 'warning') {
    const step = clip(rollback.warning, 120)
    const text = `${version ? `Restored ${version}` : 'Restored the previous version'}, verification warning${step ? `: ${step}` : ''}`
    const advice = clip(rollback.advice, 400) || `Restart the Tec-Tac services and check ${step || 'the failed step'}.`
    const parts = []
    const exit = Number.isInteger(rollback.installer_exit_status) ? rollback.installer_exit_status : null
    if (exit !== null) parts.push(`Installer exit status ${exit}`)
    const stages = list(rollback.incomplete_stages)
    if (stages.length) parts.push(`May not have run: ${stages.join(', ')}`)
    return { tone: 'warning', text, advice, detail: parts.join(' · '), restart: clip(rollback.restart, 200) }
  }
  if (status === 'failed') {
    const error = clip(rollback.error, 300)
    return { tone: 'denied', text: error ? `Rollback failed: ${error}` : 'Rollback failed', advice: '', detail: '', restart: '' }
  }
  return { tone: 'warning', text: `Rollback ${status || 'status not stated'}${version ? ` · restored ${version}` : ''}`, advice: '', detail: '', restart: '' }
}

// True for the stages Core's helper writes around a rollback, including the finished 'rolled-back' and 'rollback-failed'.
export function isRollbackStage(stage) {
  const text = String(stage || '').toLowerCase()
  return text.includes('rollback') || text.includes('rolled-back') || text.includes('rolled back')
}
