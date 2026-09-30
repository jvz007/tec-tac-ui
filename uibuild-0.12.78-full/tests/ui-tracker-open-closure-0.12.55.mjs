import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyTextWithFeedback } from '../src/copy-feedback.js'
import { scheduleHistoryCommit } from '../src/scheduler-history-loader.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

// L64: exercise clipboard failure behavior and prove all three reviewed surfaces
// are connected to the shared feedback path and a visible per-surface error ref.
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied') } } } })
assert.deepEqual(await copyTextWithFeedback('secret', { failureMessage: 'copy denied' }), { copied: false, error: 'copy denied' })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
assert.match((await copyTextWithFeedback('secret')).error, /Clipboard access is unavailable/)
for (const [rel, fn, errorRef] of [
  ['src/views/SystemUpdatesView.vue', 'copyTrustPolicyCommand', 'trustPolicyError.value = result.error'],
  ['src/components/LoginPanel.vue', 'copySetupKey', 'error.value = result.error'],
  ['src/components/access/MfaRecoveryPanel.vue', 'copyAll', 'error.value = result.error'],
]) {
  const source = read(rel)
  assert.match(source, /import \{ copyTextWithFeedback \}/, `${rel} does not use shared clipboard feedback`)
  const start = source.indexOf(`async function ${fn}`)
  assert.notEqual(start, -1, `${rel} missing ${fn}`)
  const body = source.slice(start, source.indexOf('\n}', start) + 2)
  assert.match(body, /await copyTextWithFeedback\(/, `${fn} bypasses shared clipboard helper`)
  assert.ok(body.includes(errorRef), `${fn} does not surface clipboard errors`)
}

// L69 is behaviorally covered by tests/ui-l69-resource-search-0.12.57.mjs using the production coordinator.

// L73: commit results through the same pure transition used by the view. Applying
// a failed history result changes historyError only; an unrelated Scheduler error
// remains byte-for-byte unchanged in the surrounding state.
let state = { error: 'schedule save failed', historyError: '', userRuns: [{ id: 'old' }] }
const failed = scheduleHistoryCommit({ ok: false, error: 'history unavailable' }, 'user')
state = { ...state, historyError: failed.historyError }
assert.equal(state.error, 'schedule save failed')
assert.equal(state.historyError, 'history unavailable')
assert.deepEqual(state.userRuns, [{ id: 'old' }])
const ok = scheduleHistoryCommit({ ok: true, rows: [{ id: 'new' }], meta: { page: 1, pages: 1, total: 1 } }, 'user')
assert.deepEqual(ok, { ok: true, historyError: '', owner: 'user', rows: [{ id: 'new' }], meta: { page: 1, pages: 1, total: 1 }, loaded: true })
const schedulesView = read('src/views/SchedulesView.vue')
assert.match(schedulesView, /scheduleHistoryCommit\(result,owner\)/)
assert.doesNotMatch(schedulesView.slice(schedulesView.indexOf('async function loadRunHistory'), schedulesView.indexOf('async function refresh')), /error\.value\s*=/)

// L74: canonical archive names only for the recovered sequence and later notes.
for (const version of ['0.12.32', '0.12.33', '0.12.34', '0.12.35', '0.12.41', '0.12.47']) {
  const file = path.join(root, 'docs', 'releases', `RELEASE_NOTES_${version}.md`)
  assert.equal(fs.existsSync(file), true, `missing canonical archived release note ${version}`)
  assert.equal(fs.readFileSync(file, 'utf8').split(/\r?\n/, 1)[0], `# Tec-Tac UI ${version}`)
}
const noncanonical = fs.readdirSync(path.join(root, 'docs', 'releases')).filter((name) => /^\d+\.\d+\.\d+(?:-\d+)?\.md$/.test(name) || /^RELEASE_NOTES_\d+\.\d+\.\d+-\d+\.md$/.test(name))
assert.deepEqual(noncanonical, [], `noncanonical archived release-note identities remain: ${noncanonical.join(', ')}`)

console.log('ui tracker open/partial closure 0.12.55: L64 L69 L73 L74: PASS')
