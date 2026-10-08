// 0.12.83: stage the saved source explicitly, show branch and commit, guard Install on a mismatch.
import assert from 'node:assert/strict'
import fs from 'node:fs'

globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {} }
const storage = new Map([['access_token', 'abc123']])
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null },
  setItem(key, value) { storage.set(key, String(value)) },
  removeItem(key) { storage.delete(key) },
}
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const { shortCommit, describeStageSource, stageSourceCheck } = await import('../src/update-source.js')
const { stageOnlineSystemUpdate } = await import('../src/api.js')

// shortCommit / describeStageSource
assert.equal(shortCommit('1a2b3c4d5e6f7890'), '1a2b3c4')
assert.equal(shortCommit('ABCDEF1234'), 'abcdef1')
assert.equal(shortCommit(''), '')
assert.equal(shortCommit('xyz'), '')
assert.equal(shortCommit(null), '')
assert.equal(describeStageSource({ type: 'branch', ref: 'dev', commit: '1a2b3c4d5e6f' }), 'branch dev · 1a2b3c4')
assert.equal(describeStageSource({ type: 'release', ref: 'v0.12.82', commit: '9f8e7d6aaaa' }), 'release v0.12.82 · 9f8e7d6')
assert.equal(describeStageSource({ type: 'release', ref: null }), 'release')
assert.equal(describeStageSource(null), 'offline')
assert.equal(describeStageSource(undefined), 'offline')
assert.equal(describeStageSource({}), 'offline')

const branchDev = { type: 'branch', ref: 'dev' }
const release = { type: 'release', ref: null }
const check = (requested, source, saved = branchDev) => stageSourceCheck({ requested, preview: source === undefined ? {} : { source }, saved })
const asked = (type, ref = null, oneOff = false) => ({ type, ref, oneOff })

assert.equal(check(asked('branch', 'dev'), { type: 'branch', ref: 'dev' }).state, 'match')
assert.equal(check(asked('branch', 'dev'), { type: 'release', ref: 'v1' }).state, 'mismatch')
assert.equal(check(asked('branch', 'dev'), { type: 'branch', ref: 'feature/x' }).state, 'mismatch')
assert.equal(check(asked('branch', 'dev'), { type: 'branch', ref: 'feature/x' }).blocked, true)
assert.equal(check(asked('release'), { type: 'release', ref: 'v0.12.82' }, release).state, 'match', 'release matches although preview.ref is the tag')
assert.equal(check(asked('release'), { type: 'branch', ref: 'dev' }, release).state, 'mismatch')
assert.equal(check(asked('release'), { type: 'release', ref: 'v1' }, release).blocked, false)
// One-off: allowed with a warning when it differs from the saved source.
const oneoff = check(asked('branch', 'feature/x', true), { type: 'branch', ref: 'feature/x' })
assert.equal(oneoff.state, 'oneoff')
assert.equal(oneoff.blocked, false)
assert.equal(oneoff.message, 'One-off source: not saved. Saved source is BRANCH dev.')
assert.equal(check(asked('branch', 'dev', true), { type: 'branch', ref: 'dev' }).state, 'match', 'a one-off equal to the saved source needs no warning')
assert.equal(check(asked('branch', 'feature/x', true), { type: 'branch', ref: 'other' }).state, 'mismatch', 'a one-off is still checked against what was asked')
// Offline and unchecked.
assert.equal(stageSourceCheck({ requested: null, preview: {} }).state, 'offline')
assert.equal(stageSourceCheck({ requested: null, preview: {} }).blocked, false)
assert.equal(check(asked('branch', 'dev'), undefined).state, 'unchecked')
assert.equal(check(asked('branch', 'dev'), undefined).blocked, false)
assert.equal(stageSourceCheck({}).state, 'offline')

// stageOnlineSystemUpdate posts the explicit source.
let body = null
globalThis.fetch = async (url, init) => { body = JSON.parse(init.body); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
await stageOnlineSystemUpdate('ui', 'branch', 'dev')
assert.deepEqual(body, { component: 'ui', source_type: 'branch', ref: 'dev' })
await stageOnlineSystemUpdate('framework', 'release', null)
assert.deepEqual(body, { component: 'framework', source_type: 'release', ref: null })

// Source assertions on the view.
const view = read('../src/views/SystemUpdatesView.vue')
const script = view.slice(0, view.indexOf('</script>'))
const template = view.slice(view.indexOf('<template>'))
const stageFn = script.slice(script.indexOf('async function stageOnline'), script.indexOf('function pickOfflinePackage'))
assert.match(stageFn, /else if \(sourcesSupported\.value\) \{\s*type = saved\.type\s*ref = saved\.type === 'branch' \? saved\.ref : null/)
assert.match(stageFn, /let type = 'release'\s*let ref = null/, 'the older-Core path stays an explicit release')
assert.match(stageFn, /stageOnlineSystemUpdate\(component, type, ref\)/)
assert.match(stageFn, /stageRequest\.value = \{ component, type, ref, oneOff \}/)
assert.match(script, /async function clearStage[\s\S]*?stageRequest\.value = null/)
assert.match(script, /async function installStage[\s\S]*?stageRequest\.value = null/)
assert.match(script, /stage\.value = await inspectSystemUpdatePackage[\s\S]*?stageRequest\.value = null/)
assert.match(script, /stageSourceCheck\(\{/)
assert.match(script, /stageCheck\.value\.blocked\) return/, 'installStage refuses a mismatch')
assert.match(template, /describeStageSource\(stage\.preview\.source\)/)
assert.match(template, /:disabled="stageBusy \|\| stageCheck\.blocked \|\|/, 'the Install button is disabled on a mismatch')
assert.match(template, /data-test="stage-source-mismatch"/)
assert.match(template, /data-test="stage-source-oneoff"/)
assert.match(template, /@click="stageOnline\(component\.id\)"/)
assert.match(read('../src/help/articles/system-updates.md'), /Install is blocked/)
console.log('[TEST] PASS update source stage')
