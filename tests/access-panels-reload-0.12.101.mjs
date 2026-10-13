// 0.12.101: an access panel shows Loading only on its first load. A later load keeps the page mounted (an open editor, the
// one-time key dialog and the provider dialog survive), marks the page refreshing, and the list controls wait. A stale result
// is ignored. The API keys owner comes only from a valid Tactical user id, and nothing is guessed.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const keys = await import(new URL('../src/api-keys.js', import.meta.url).href)
const { createLoadPhase, finishLoadPhase, startLoadPhase } = await import(new URL('../src/load-phase.js', import.meta.url).href)
const { createKeyedLatestRequestGate } = await import(new URL('../src/latest-request-gate.js', import.meta.url).href)
const apiKeysPanel = read('../src/components/access/ApiKeysPanel.vue')
const ssoPanel = read('../src/components/access/SsoAdminPanel.vue')

// (1) selfOwner: a whole number of at least 1 (digits in a string count), otherwise null.
const owner = (id, username) => keys.selfOwner({ user: { id, username } })
assert.deepEqual(owner(7, 'johan'), { id: 7, username: 'johan' })
assert.equal(owner('7', 'johan').id, 7, "a string of digits is accepted as the id 7")
for (const bad of [null, undefined, 0, -1, 1.5, 'abc', {}, [], '', '0', NaN, true, 2 ** 60]) {
  assert.equal(owner(bad, 'x'), null, `selfOwner refuses ${JSON.stringify(bad)}`)
}
assert.equal(keys.selfOwner({}), null, 'no user at all')
assert.equal(keys.selfOwner(null), null, 'no context at all')

// (2) buildCreatePayload still refuses a bad owner (the picker path and the self path both go through it)
for (const bad of [0, -1, 1.5, 'abc', null, undefined]) {
  assert.throws(() => keys.buildCreatePayload({ name: 'Backup', ownerId: bad, expiration: null }), TypeError, `owner ${String(bad)}`)
}
assert.deepEqual(keys.buildCreatePayload({ name: ' Backup ', ownerId: '7', expiration: null }), { name: 'Backup', user: 7, expiration: null })

// (3) the API keys panel: the create default is the signed-in id; with no users list and no valid id, Add is disabled.
assert.match(apiKeysPanel, /const self = computed\(\(\) => selfOwner\(state\.context\)\)/)
assert.match(apiKeysPanel, /const createBlocked = computed\(\(\) => !usersAvailable\.value && !self\.value\)/)
assert.match(apiKeysPanel, /:disabled="phase\.refreshing \|\| createBlocked" @click="openCreate"/)
assert.match(apiKeysPanel, /if \(createBlocked\.value\) return/, 'openCreate refuses too, not only the button')
assert.match(apiKeysPanel, /Your account id is not available, so a key cannot be created here\. Sign in again\./)
assert.match(apiKeysPanel, /ownerId: self\.value\?\.id \?\? null/)
assert.doesNotMatch(apiKeysPanel, /state\.context\.user\?\.id \?\? null/, 'the old fallback is gone')
// Edit keeps the row's own owner
assert.match(apiKeysPanel, /function openEdit\(row\) \{[\s\S]*?ownerId: row\.user,/)

// (4) load phase: first load shows Loading; a later load keeps the page and marks it refreshing; a finished load clears both
{
  const phase = createLoadPhase()
  assert.equal(phase.loading, true, 'the first load shows Loading')
  assert.equal(phase.loaded, false)
  startLoadPhase(phase)
  assert.deepEqual({ ...phase }, { loaded: false, loading: true, refreshing: false })
  finishLoadPhase(phase)
  assert.deepEqual({ ...phase }, { loaded: true, loading: false, refreshing: false })
  startLoadPhase(phase)
  assert.deepEqual({ ...phase }, { loaded: true, loading: false, refreshing: true }, 'a later load keeps the page mounted')
  finishLoadPhase(phase)
  assert.deepEqual({ ...phase }, { loaded: true, loading: false, refreshing: false })
  // a failed first load also counts as loaded, so a retry is a refresh and not a blank page
  const failed = createLoadPhase()
  startLoadPhase(failed)
  finishLoadPhase(failed)
  startLoadPhase(failed)
  assert.equal(failed.loading, false)
  assert.equal(failed.refreshing, true)
}

// (5) the latest-request gate: only the latest request may finish the load; an older result is ignored
{
  const gate = createKeyedLatestRequestGate(['keys'])
  const older = gate.begin('keys')
  const newer = gate.begin('keys')
  assert.equal(gate.isCurrent('keys', older), false, 'an older response is stale')
  assert.equal(gate.isCurrent('keys', newer), true)
}

// (6) both panels: the root Loading line is for the first load only, and every list control waits for a refresh
for (const [name, source, loadingText] of [
  ['ApiKeysPanel.vue', apiKeysPanel, 'Loading API keys…'],
  ['SsoAdminPanel.vue', ssoPanel, 'Loading single sign-on…'],
]) {
  assert.match(source, /import \{ createLoadPhase, finishLoadPhase, startLoadPhase \} from '\.\.\/\.\.\/load-phase'/, `${name} uses the load phase`)
  assert.match(source, /const phase = reactive\(createLoadPhase\(\)\)/, `${name} keeps one phase`)
  assert.match(source, /startLoadPhase\(phase\)/)
  assert.match(source, /if \(gate\.isCurrent\('(keys|sso)', request\)\) finishLoadPhase\(phase\)/, `${name} finishes only for the latest request`)
  assert.match(source, new RegExp(`<div v-if="phase\\.loading" class="callout mono">${loadingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</div>`))
  assert.doesNotMatch(source, /v-if="loading"|loading\.value/, `${name} has no old loading flag`)
  assert.match(source, /<span v-if="phase\.refreshing" class="muted mono" role="status">Refreshing…<\/span>/)
  // the Refresh control and the rows' Edit and Delete wait for a refresh
  assert.match(source, /<button class="btn" :disabled="phase\.refreshing" @click="load">Refresh<\/button>/)
  assert.match(source, /<button class="btn sm" :disabled="phase\.refreshing" @click="openEdit\(row\)">Edit<\/button>/)
  assert.match(source, /<button class="btn sm danger" :disabled="phase\.refreshing" @click="removeKey\(row\)">Delete<\/button>|<button class="btn sm danger" :disabled="phase\.refreshing" @click="removeProvider\(row\)">Delete<\/button>/)
  // the open dialogs sit after the page root, so a refresh (which keeps the page) does not remove them
  const root = source.indexOf('<div v-else>')
  assert.ok(root > source.indexOf('<div v-if="phase.loading"'), `${name} keeps the page root on a refresh`)
}

// (7) API keys: Show and Copy wait for a refresh; Add is refused in both the button and the function
assert.match(apiKeysPanel, /:disabled="phase\.refreshing" :aria-label="`\$\{revealed\.has\(row\.id\) \? 'Hide' : 'Show'\} the key/)
assert.match(apiKeysPanel, /:disabled="!row\.key \|\| phase\.refreshing" :aria-label="`Copy the key/)

// (8) SSO: a later load keeps the settings draft the person has changed; only the first load fills it from storage
assert.match(ssoPanel, /const firstLoad = !phase\.loaded/)
assert.match(ssoPanel, /if \(firstLoad\) draft\.value = \{ \.\.\.stored\.value \}/)
assert.doesNotMatch(ssoPanel, /\n    draft\.value = \{ \.\.\.stored\.value \}\n    \} catch/, 'load() no longer resets the draft on every refresh')
// the provider dialog's own Save, Cancel and Done are unchanged and not disabled by the refresh
assert.match(ssoPanel, /<button class="btn primary" :disabled="providerDialog\.saving" @click="saveProvider">/)
assert.match(apiKeysPanel, /<button class="btn primary" :disabled="editor\.saving" @click="saveEditor">/)

console.log('access panels reload 0.12.101: ok')
