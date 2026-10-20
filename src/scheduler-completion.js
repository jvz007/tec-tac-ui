// 0.12.118: a run that waits for a result (Core 1.17.61 pending completion) and the plain words for Core's run error types
// (Core 1.17.61 to 1.17.65). Pure and import-free. The run status stays 'running': Core adds no new status value.

export const WAITING_LABEL = 'Waiting for the result'

const KIND_WORDS = Object.freeze({ module: 'a module job', server_maintenance_job: 'a server maintenance job' })

export function kindWords(kind) {
  return Object.prototype.hasOwnProperty.call(KIND_WORDS, kind) ? KIND_WORDS[kind] : 'a job'
}

// { label, kind, since } for a run that is waiting, else null. A run with completion null, an older Core, or a completion
// that is completed or expired draws nothing extra.
export function pendingCompletion(run) {
  const completion = run && typeof run === 'object' ? run.completion : null
  if (!completion || typeof completion !== 'object' || completion.state !== 'pending') return null
  return {
    label: WAITING_LABEL,
    kind: kindWords(completion.kind),
    since: typeof completion.since === 'string' ? completion.since : '',
  }
}

export const ERROR_WORDS = Object.freeze({
  CompletionTimeout: 'The job this run was waiting for did not finish in time, so the run was stopped.',
  ExternalFailed: 'The job this run was waiting for failed.',
  ExternalCancelled: 'The job this run was waiting for was cancelled.',
  ExternalTimedOut: 'The job this run was waiting for timed out.',
  PendingRefused: 'Core could not wait for this job, so the run failed.',
  SystemActionRefused: 'Core refused this system action.',
  OutcomeUnknown: 'Core could not tell how this run ended.',
})

// A known type reads as a sentence. Any other type is shown as sent.
export function errorWords(type) {
  const key = typeof type === 'string' ? type : ''
  return Object.prototype.hasOwnProperty.call(ERROR_WORDS, key) ? ERROR_WORDS[key] : key
}
