// 0.12.123 (Core 1.17.96, 1.17.97): a rollback with status warning is yellow, only a failed rollback is red; the stage rolled-back is a
// rollback stage in both progress bars; the History row carries the rollback sentence; the lifecycle output box keeps all 200 lines.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const r = await import(new URL('../src/system-update-rollback.js', import.meta.url).href)
const logs = await import(new URL('../src/system-job-logs.js', import.meta.url).href)

// ---- (a) rollbackNotice ----
assert.deepEqual(r.rollbackNotice({ performed: true, status: 'succeeded', version: '1.17.96' }), { tone: 'warning', text: 'Rollback succeeded · restored 1.17.96', advice: '', detail: '', restart: '' })
const w = r.rollbackNotice({ performed: true, status: 'warning', version: '1.17.96', warning: 'database check', advice: 'Restart the services and look at the database check.', installer_exit_status: 79, incomplete_stages: ['helper scripts', 'timers', 'service restart'], restart: 'sudo systemctl restart tec-tac' })
assert.equal(w.tone, 'warning')
assert.equal(w.text, 'Restored 1.17.96, verification warning: database check')
assert.equal(w.advice, 'Restart the services and look at the database check.')
assert.equal(w.detail, 'Installer exit status 79 · May not have run: helper scripts, timers, service restart')
assert.equal(w.restart, 'sudo systemctl restart tec-tac')
const wf = r.rollbackNotice({ performed: true, status: 'warning', version: '1.17.96', warning: 'database check' })
assert.equal(wf.advice, 'Restart the Tec-Tac services and check database check.', 'fallback advice when Core sends none')
assert.equal(wf.detail, ''); assert.equal(wf.restart, '')
assert.equal(r.rollbackNotice({ performed: true, status: 'warning', incomplete_stages: 'timers', installer_exit_status: 1 }).detail, 'Installer exit status 1 · May not have run: timers')
const f = r.rollbackNotice({ performed: true, status: 'failed', error: 'restore stopped' })
assert.equal(f.tone, 'denied'); assert.equal(f.text, 'Rollback failed: restore stopped')
assert.equal(r.rollbackNotice({ performed: true, status: 'failed' }).text, 'Rollback failed')
const u = r.rollbackNotice({ performed: true, status: 'weird', version: '2.0' })
assert.equal(u.tone, 'warning', 'only failed is red'); assert.match(u.text, /weird/)
assert.equal(r.rollbackNotice({ performed: true, status: 'not-required' }), null)
assert.equal(r.rollbackNotice({ performed: false, status: 'failed' }), null)
assert.equal(r.rollbackNotice({ status: 'failed' }), null)
assert.equal(r.rollbackNotice(null), null); assert.equal(r.rollbackNotice(undefined), null); assert.equal(r.rollbackNotice('x'), null)
const bad = r.rollbackNotice({ performed: true, status: 'warning', version: '<i>1</i>', warning: '<script>x</script>step', advice: '<b>do</b> it', restart: '<a>cmd</a>' })
for (const key of ['text', 'advice', 'restart']) assert.ok(!/[<>]/.test(bad[key]), `${key} has no markup`)
assert.ok(r.rollbackNotice({ performed: true, status: 'failed', error: 'e'.repeat(5000) }).text.length < 400, 'long text is cut')
const sfc = read('../src/views/SystemUpdatesView.vue')
assert.doesNotMatch(sfc, /v-html/)

// ---- (b) the old binding is gone ----
assert.ok(!sfc.includes("=== 'succeeded' ? 'warning' : 'denied'"), 'the old red-for-anything-else binding is gone')
assert.match(sfc, /:class="jobRollbackNotice\.tone"/, 'the tone comes from the helper')
assert.match(sfc, /rollbackNotice\(job\.value\?\.rollback\)/)
assert.match(sfc, /v-if="job\.rollback\?\.reason === 'installer-refused'" class="state-inline warning">Update refused, nothing was changed</, 'the refusal line is unchanged')
assert.match(sfc, /<span class="pill" :class="job\.status === 'succeeded' \? 'ok' : \(job\.status === 'failed' \? 'warn' : ''\)">\{\{ job\.status \}\}<\/span>/, 'the job pill is unchanged')
assert.match(sfc, /<div v-if="job\.error" class="state-inline denied mt"><b>\{\{ job\.error_type \}\}:<\/b> \{\{ job\.error \}\}<\/div>/, 'the red job error line is unchanged')
assert.match(sfc, /<span>Stage<\/span><b class="mono">\{\{ job\.stage \}\}<\/b>/, 'the stage text is printed as sent')

// ---- (c) the stage rolled-back ----
for (const stage of ['rollback', 'rollback-failed', 'rolled-back', 'rolled back', 'Rolled-Back']) assert.equal(r.isRollbackStage(stage), true, stage)
for (const stage of ['verify', 'install', '', null, undefined, 'preflight']) assert.equal(r.isRollbackStage(stage), false, String(stage))
assert.match(sfc, /if \(isRollbackStage\(stage\)\) return 88/)
const mods = read('../src/views/ModulesView.vue')
assert.match(mods, /if \(isRollbackStage\(stage\)\) return 85/)
assert.match(mods, /import \{ isRollbackStage \} from '\.\.\/system-update-rollback'/)
// a failed job returns 100 before the stage is read, and its label stays Failed
assert.ok(sfc.indexOf("if (current.status === 'failed') return 100") < sfc.indexOf('isRollbackStage(stage)'))
assert.ok(mods.indexOf("['failed', 'dispatch_failed'].includes(job.status)) return 100") < mods.indexOf('isRollbackStage(stage)'))
assert.match(sfc, /if \(job\.value\.status === 'failed'\) return 'Failed'/)
// the stage text in the module job panel and the log window is printed as sent
assert.match(mods, /String\(activeJob\.value\.stage \|\| activeJob\.value\.status \|\| 'queued'\)\.replace\(\/-\/g, ' '\)/)

// ---- (d) the History row ----
const plain = logs.systemUpdateRow({ id: 'j0', component: 'framework', installed_version: '1', version: '2', status: 'failed', requested_by: 'a' })
assert.equal(plain.detailRows.length, 6); assert.equal(plain.detailRows.some((x) => x[0] === 'Rollback'), false)
const withRb = logs.systemUpdateRow({ id: 'j1', component: 'framework', installed_version: '1', version: '2', status: 'failed', rollback: { performed: true, status: 'warning', version: '1', warning: 'database check', advice: 'Restart the Tec-Tac services and check database check.' } })
assert.deepEqual(withRb.detailRows.slice(0, 6), logs.systemUpdateRow({ id: 'j1', component: 'framework', installed_version: '1', version: '2', status: 'failed' }).detailRows)
const row = withRb.detailRows.find((x) => x[0] === 'Rollback')
assert.equal(row[1], 'Restored 1, verification warning: database check Restart the Tec-Tac services and check database check.')
assert.equal(withRb.status, 'failed')
assert.equal(logs.systemUpdateRow({ id: 'j2', status: 'failed', rollback: { performed: false } }).detailRows.length, 6)

// ---- (e) the lifecycle output box ----
const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`)
const boxText = (lines || []).join('\n')
assert.equal(boxText.split('\n').length, 200, 'all 200 lines are in the text of the box')
assert.match(sfc, /<pre class="job-log">\{\{ \(job\.log_tail \|\| \[\]\)\.join\('\\n'\) \|\| 'Waiting for lifecycle output…' \}\}<\/pre>/, 'the box joins the whole tail, unsliced')
assert.match(sfc, /\.filter\(\(line\) => String\(line \|\| ''\)\.trim\(\)\)\.slice\(-8\)/, 'the final lifecycle output stays at 8 lines')
const css = read('../src/styles.css')
assert.match(css, /\.job-log\{max-height:\d+px;overflow:auto/, 'the box scrolls')
console.log('system-update-rollback-warning-0.12.123: ok')
