// 0.12.95: Install and Cancel / discard stay disabled while an install request is in flight, so a second click sends no
// second install and a discard cannot remove the upload an install is using. A cancelled chained confirmation keeps the
// reload hint. Source-plus-runtime: the real functions are read from ModulesView.vue and run against stubs (the SFC is not mounted here).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const view = fs.readFileSync(new URL('../src/views/ModulesView.vue', import.meta.url), 'utf8')
function extractFunction(name) {
  let start = view.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `ModulesView.vue has function ${name}`)
  if (view.slice(start - 6, start) === 'async ') start -= 6
  let depth = 0
  let end = view.indexOf('{', start)
  for (; end < view.length; end += 1) {
    if (view[end] === '{') depth += 1
    else if (view[end] === '}') { depth -= 1; if (depth === 0) break }
  }
  return view.slice(start, end + 1)
}
const FUNCTIONS = [
  'trustLabelOf', 'trustClassOf', 'trustFieldsOf', 'planOf', 'stagedRowsOf', 'groupFor', 'stagedGroups', 'kindOf', 'orderFor',
  'compositeOf', 'restageGroups', 'dependencyViolation', 'notRunMessage', 'clearStaged', 'install', 'closeInstallConfirm',
  'confirmInstall', 'runInstall',
]
const body = FUNCTIONS.map(extractFunction).join('\n')
const build = new Function('deps', `
  const { staged, installOrder, installing, installConfirm, error, queueWarning, confirmedDisable, plan, jobRunning,
    installModuleArtifact, discardModuleArtifact, installConfirmSummary, confirmationRequired, replacementListChangedText,
    beginPoll, willDisableIds } = deps
  // 0.12.118: the licence override helpers the page added; this test is about the install guard, so they do nothing here.
  const clearLicence = () => {}
  const noteLicenceRefusal = () => {}
  const stagedRows = { get value() { return staged.value ? stagedRowsOf(staged.value.composite ? { kind: 'batch' } : staged.value) : [] } }
  ${body}
  return { install, runInstall, confirmInstall, clearStaged, closeInstallConfirm, stagedGroups, restageGroups, runInstallRef: runInstall }
`)

const ref = (value) => ({ value })
const payload = (uploadId) => ({
  kind: 'package',
  upload_id: uploadId,
  filename: `${uploadId}.zip`,
  publisher_trust: { state: 'unsigned', signed: false },
  preview: { id: uploadId, kind: 'package', plan: { valid: true, order: [uploadId], actions: [{ id: uploadId, action: 'install' }], will_disable: [] } },
  plan: { valid: true, order: [uploadId], actions: [{ id: uploadId, action: 'install' }], will_disable: [] },
})
function makeView(stagedPayload, extra = {}) {
  const state = {
    staged: ref(stagedPayload),
    installOrder: ref(stagedPayload ? [stagedPayload.preview.id] : []),
    installing: ref(false),
    installConfirm: ref(null),
    error: ref(''),
    queueWarning: ref(''),
    confirmedDisable: ref([]),
    plan: ref(stagedPayload ? stagedPayload.plan : null),
    jobRunning: ref(false),
    discarded: [],
    polls: [],
    installCalls: [],
    pending: null,
    ...extra,
  }
  const api = build({
    staged: state.staged,
    installOrder: state.installOrder,
    installing: state.installing,
    installConfirm: state.installConfirm,
    error: state.error,
    queueWarning: state.queueWarning,
    confirmedDisable: state.confirmedDisable,
    plan: state.plan,
    jobRunning: state.jobRunning,
    installModuleArtifact: (...args) => {
      state.installCalls.push(args)
      if (state.installFn) return state.installFn(...args)
      return new Promise((resolve, reject) => { state.pending = { resolve, reject } })
    },
    discardModuleArtifact: async (id) => { state.discarded.push(id) },
    installConfirmSummary: (plan) => ({ ids: [...(plan?.will_disable || [])], lines: (plan?.will_disable || []).map((id) => `Switch off ${id}`) }),
    confirmationRequired: (e) => (e && e.fresh !== undefined ? e.fresh : null),
    replacementListChangedText: () => 'The list of replaced modules changed.',
    beginPoll: (job) => state.polls.push(job),
    willDisableIds: (list) => list || [],
  })
  return { api, state }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

// (1) a second Install while the first request is in flight sends nothing.
{
  const { api, state } = makeView(payload('alpha'))
  const first = api.install()
  await flush()
  assert.equal(state.installing.value, true, 'the flag is set while the request is in flight')
  assert.equal(state.installCalls.length, 1)
  await api.install()
  await api.install()
  assert.equal(state.installCalls.length, 1, 'a second install() sends nothing')
  // Discard during the install removes nothing, and the staged payload stays.
  await api.clearStaged()
  assert.deepEqual(state.discarded, [], 'a discard during an install removes no upload')
  assert.ok(state.staged.value, 'the staged payload stays')
  // The confirm path is guarded too.
  state.installConfirm.value = { ids: [], lines: [], partial: false }
  await api.confirmInstall()
  assert.equal(state.installCalls.length, 1, 'confirmInstall sends nothing while an install is in flight')
  state.pending.reject(Object.assign(new Error('Core refused the install.'), {}))
  await first
  assert.equal(state.installing.value, false, 'the flag clears after a failed request')
  assert.equal(state.error.value, 'Core refused the install.')
  // Working again: discard now runs.
  await api.clearStaged()
  assert.deepEqual(state.discarded, ['alpha'], 'after the request settles, discard works again')
  assert.equal(state.staged.value, null)
}

// (2) the flag clears after a successful request, and the job is followed.
{
  const { api, state } = makeView(payload('beta'))
  const run = api.install()
  await flush()
  state.pending.resolve({ id: 'job-1', status: 'queued' })
  await run
  assert.equal(state.installing.value, false, 'the flag clears after success')
  assert.deepEqual(state.polls, [{ id: 'job-1', status: 'queued' }])
  assert.equal(state.staged.value, null, 'the one group is no longer staged')
}

// (3) a replacement confirmation: Install opens it and the flag is clear, so the person can answer it.
{
  const replaced = payload('gamma')
  replaced.plan = { ...replaced.plan, will_disable: ['old-module'] }
  const { api, state } = makeView(replaced)
  await api.install()
  assert.ok(state.installConfirm.value, 'a replacement opens the confirmation')
  assert.equal(state.installing.value, false, 'a waiting confirmation does not hold the flag')
  assert.equal(state.installCalls.length, 0)
}

// (4) a cancelled first set gives no reload hint; a cancelled chained set keeps it.
{
  const { api, state } = makeView(payload('delta'))
  state.installConfirm.value = { ids: ['x'], lines: ['Switch off x'], changed: '', exact: false, partial: false }
  api.closeInstallConfirm()
  assert.equal(state.error.value, '', 'the first set cancelled shows no reload hint')
  assert.equal(state.installConfirm.value, null)
}
{
  const { api, state } = makeView(payload('epsilon'))
  state.installConfirm.value = { ids: ['x'], lines: ['Switch off x'], changed: '', exact: false, partial: true }
  api.closeInstallConfirm()
  assert.match(state.error.value, /Install cancelled\./)
  assert.match(state.error.value, /Reload Tec-Tac to load the packages that installed\./)
  assert.match(state.error.value, /Not run yet: /)
  assert.match(state.error.value, /They stay staged\./)
}
{
  // A chained set (afterSuccess) asks for a fresh confirmation: the hint carries into the dialog, and cancelling keeps it.
  const { api, state } = makeView(payload('zeta'))
  state.installFn = async () => { throw Object.assign(new Error('confirm'), { fresh: ['old-module'] }) }
  await api.runInstall([], false, true)
  assert.ok(state.installConfirm.value, 'the confirmation opens')
  assert.equal(state.installConfirm.value.partial, true, 'the dialog remembers it is a chained set')
  api.closeInstallConfirm()
  assert.match(state.error.value, /Reload Tec-Tac to load the packages that installed\./)
  assert.match(state.error.value, /Not run yet: /)
}
{
  // The first set's own confirmation: nothing installed yet, so cancelling shows nothing.
  const { api, state } = makeView(payload('eta'))
  state.installFn = async () => { throw Object.assign(new Error('confirm'), { fresh: ['old-module'] }) }
  await api.runInstall([])
  assert.equal(state.installConfirm.value.partial, false)
  api.closeInstallConfirm()
  assert.equal(state.error.value, '')
}
{
  // Confirmed, then the install fails: the reload hint stays.
  const { api, state } = makeView(payload('theta'))
  state.installConfirm.value = { ids: ['old-module'], lines: [], changed: '', exact: true, partial: true }
  state.installFn = async () => { throw new Error('Core refused the switch.') }
  await api.confirmInstall()
  assert.match(state.error.value, /Core refused the switch\./)
  assert.match(state.error.value, /Reload Tec-Tac to load the packages that installed\./)
  assert.equal(state.installing.value, false)
}

// (5) the rendered buttons are disabled while a request is in flight (source check of the footer and dialog).
const footer = view.slice(view.indexOf('<div class="queue-footer"><button class="btn" :disabled="jobRunning || installing" @click="clearStaged">'))
assert.ok(footer.startsWith('<div class="queue-footer"><button class="btn" :disabled="jobRunning || installing" @click="clearStaged">Cancel / discard</button>'), 'Cancel / discard is disabled while installing')
assert.match(view, /<button class="btn primary" :disabled="!plan\?\.valid \|\| !orderedRows\.length \|\| jobRunning \|\| installing" @click="install">/, 'Install is disabled while installing')
assert.match(view, /<button class="btn primary" :disabled="jobRunning \|\| installing" @click="confirmInstall">/, 'the install confirmation is disabled while installing')
assert.match(view, /const installing = ref\(false\)/)
assert.match(extractFunction('install'), /if \(installing\.value\) return/)
assert.match(extractFunction('clearStaged'), /if \(installing\.value\) return/)
assert.match(extractFunction('confirmInstall'), /installing\.value/)
assert.match(extractFunction('runInstall'), /installing\.value = true[\s\S]*finally \{\s*installing\.value = false/)

console.log('module-install-guard-0.12.95: ok')
