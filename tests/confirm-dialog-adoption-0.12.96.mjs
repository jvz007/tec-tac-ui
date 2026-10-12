// 0.12.96: Core's own pages use the shell Yes or No dialog. No browser-style OK or Cancel remains, and no typed
// confirmation (a typed name, id or number) is left anywhere in Core's pages.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetTotpWorkflow, revokeOthersWorkflow } from '../src/my-account-workflows.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(vue|js)$/.test(entry.name) ? [full] : []
  })
}

// (1) No browser dialog anywhere under src/.
for (const file of walk(path.join(root, 'src'))) {
  const source = fs.readFileSync(file, 'utf8')
  assert.doesNotMatch(source, /\b(window|globalThis|self)\.(confirm|alert|prompt)\s*\(/, `${file}: a browser dialog remains`)
  assert.doesNotMatch(source, /(^|[^.\w$])(alert|prompt)\s*\(/m, `${file}: a bare alert or prompt remains`)
}

// (2) No typed-confirmation text in Modules and Schedules.
const modules = read('src/views/ModulesView.vue')
const schedules = read('src/views/SchedulesView.vue')
for (const [name, source] of [['ModulesView', modules], ['SchedulesView', schedules]]) {
  assert.doesNotMatch(source, /to confirm/i, `${name}: typed field text remains`)
  assert.doesNotMatch(source, /Type the schedule name|Type \{\{/, `${name}: typed field remains`)
}
assert.doesNotMatch(modules, /confirmText/)
assert.doesNotMatch(schedules, /confirmText|forceDeleteText|forceDeleteRequired/)
assert.match(modules, /Are you sure\?/)
assert.match(modules, /@click="confirmAction">Yes</)
// The two-step hand-back dialog is a review screen with no typed text: its checkbox and its own button stay.
assert.match(modules, /switchAck/)
assert.match(modules, /confirmSwitchAction/)
// Schedules force delete: the shell dialog names the schedule and the number of active runs, and compares no typed name.
assert.match(schedules, /Force delete \$\{item\.name\}\?/)
assert.match(schedules, /active run\$\{count===1\?'':'s'\} will be failed/)
assert.doesNotMatch(schedules, /!==item\.name|!==deleteConfirm\.name/)

// (3) Every converted call site uses useConfirm (or the injected service) and awaits it.
const sites = {
  'src/components/access/UsersPanel.vue': 3,
  'src/components/access/RolesPanel.vue': 1,
  'src/components/access/AdminSessionsPanel.vue': 2,
  'src/views/MyAccountView.vue': 0,
  'src/views/PreferencesView.vue': 2,
  'src/views/DashboardView.vue': 1,
  'src/views/ModulesView.vue': 2,
  'src/views/ResourcesView.vue': 1,
  'src/views/SchedulesView.vue': 3,
  'src/App.vue': 1,
}
for (const [file, awaited] of Object.entries(sites)) {
  const source = read(file)
  assert.match(source, /useConfirm/, `${file} imports useConfirm`)
  assert.match(source, /useConfirm\(\)/, `${file} calls useConfirm()`)
  const calls = source.match(/\(await (confirmAction|askConfirm)\(/g) || []
  assert.ok(calls.length >= awaited, `${file}: expected ${awaited} awaited confirms, found ${calls.length}`)
  assert.doesNotMatch(source, /[^t]\s(confirmAction|askConfirm)\(\{[^)]*\}\)\s*\)\s*return/, `${file}: a confirm is not awaited`)
}
// A confirm that is not awaited would be a truthy Promise: the my-account callbacks must hand the Promise back.
const account = read('src/views/MyAccountView.vue')
assert.match(account, /confirmReset: \(\) => confirmAction\(/)
assert.match(account, /confirmRevoke: \(\) => confirmAction\(/)
const workflows = read('src/my-account-workflows.js')
assert.match(workflows, /await confirmReset\(\)/)
assert.match(workflows, /await confirmRevoke\(\)/)
// Dangerous module actions on Clients and Sites and the quick action: question and target.
const resources = read('src/views/ResourcesView.vue')
assert.match(resources, /question: `Run \$\{action\.label\}\?`, target: row\.name \|\| resourceType/)
assert.match(read('src/App.vue'), /question: `Run quick action \$\{pin\.label\}\?`/)
// Session prompts keep their sentences from admin-session-state.js.
const sessions = read('src/components/access/AdminSessionsPanel.vue')
assert.match(sessions, /question: revokeSessionPrompt\(row\)/)
assert.match(sessions, /question: revokeUserSessionsPrompt\(row\)/)

// (4) The my-account workflows with an async confirm: false cancels without a request, true proceeds.
{
  let requests = 0
  const dep = { resetMyTotp: async () => { requests += 1; return {} }, clearSession() {}, reload() {} }
  const cancelled = await resetTotpWorkflow({ password: 'p', code: '123456' }, { ...dep, confirmReset: async () => false })
  assert.equal(cancelled.cancelled, true)
  assert.equal(requests, 0)
  await resetTotpWorkflow({ password: 'p', code: '123456' }, { ...dep, confirmReset: async () => true })
  assert.equal(requests, 1)
  let revokes = 0
  const revoke = { revokeMyOtherSessions: async () => { revokes += 1; return { revoked: 1 } } }
  assert.equal((await revokeOthersWorkflow({ ...revoke, confirmRevoke: async () => false })).cancelled, true)
  assert.equal(revokes, 0)
  await revokeOthersWorkflow({ ...revoke, confirmRevoke: async () => true })
  assert.equal(revokes, 1)
}

// (5) useConfirm answers No, and never window.confirm, when the service is not provided.
const confirmSource = read('src/confirm-dialog.js')
assert.match(confirmSource, /Promise\.resolve\(false\)/)
assert.doesNotMatch(confirmSource, /window\.confirm\s*\(/)

console.log('confirm-dialog-adoption-0.12.96: PASS')
