// 0.12.118: the Licensing card on System Configuration (Core 1.17.58, docs/module-licensing.md). The normalisers on Core's documented
// answers, the one-key PATCH, who sees the selector, the plain Yes or No, and what is hidden on 403 and 404. The SFC is read as source.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const lic = await import(new URL('../src/licensing.js', import.meta.url).href)
const settings = await import(new URL('../src/runtime-settings.js', import.meta.url).href)

// ---- the mode from the runtime-settings answer ----
const modePayload = { licensing_enforcement_mode: { value: 'log-only', source: 'default', choices: ['off', 'log-only', 'enforce'], default: 'log-only' }, system_name: { value: 'Tec-Tac' } }
assert.deepEqual(lic.normalizeLicensingMode(modePayload), { value: 'log-only', source: 'default', choices: ['off', 'log-only', 'enforce'], default: 'log-only' })
assert.equal(lic.normalizeLicensingMode({}), null, 'a Core with no licensing mode leaves the selector out')
assert.equal(lic.normalizeLicensingMode(null), null)
assert.equal(lic.normalizeLicensingMode({ licensing_enforcement_mode: { value: 'maybe' } }).value, 'log-only', 'an unknown value reads as the default, never as a stronger mode')
assert.deepEqual(lic.LICENSING_MODES, ['off', 'log-only', 'enforce'])
assert.match(lic.MODE_SENTENCES['log-only'], /still allowed.*Core writes a record/)
assert.match(lic.MODE_SENTENCES.enforce, /refused at stage and install/)
assert.match(lic.MODE_SENTENCES.off, /stops checking/)

// ---- Core's documented status answers ----
const documented = {
  mode: { value: 'log-only', source: 'default', choices: ['off', 'log-only', 'enforce'], default: 'log-only' },
  enforcing: false,
  licence: { state: 'licensing_unavailable', module_licensing: 'provisional', reason: 'Module licensing is provisional: ...' },
  would_block: { count: 1, modules: [{ module_id: 'reportmanager', version: '0.6.2', state: 'unlicensed', reason: "Product 'reportmanager' is not licensed." }], limit: 50 },
  grace: { window_days: 7, days_left: null, reason: 'The grace window needs a signed refresh time that does not exist yet.' },
  never_blocked: ['sign-in', 'Tactical operations', 'rollback', 'security updates'],
  revoked_effect: 'A revoked licence will disable new module installs only when enforcement is on. That is not active: ...',
  // Never sent by Core. If it were, none of it may reach the page.
  licence_key: 'KEY-SECRET', token: 'tok-secret', fingerprint: 'fp-secret',
}
const status = lic.normalizeLicensingStatus(documented)
const serialised = JSON.stringify(status)
for (const bad of ['KEY-SECRET', 'tok-secret', 'fp-secret']) assert.ok(!serialised.includes(bad), `no ${bad} in the model`)
assert.equal(status.licenceState, 'licensing_unavailable')
assert.equal(lic.licenceSentence('licensing_unavailable'), 'Module licensing is not live yet, so no module is treated as licensed')
assert.equal(status.wouldBlock.count, 1)
assert.deepEqual(status.wouldBlock.modules, [{ module: 'reportmanager', version: '0.6.2', state: 'unlicensed', reason: "Product 'reportmanager' is not licensed." }])
assert.deepEqual(status.neverBlocked, ['sign-in', 'Tactical operations', 'rollback', 'security updates'])
assert.equal(lic.NEVER_BLOCKED_LEAD, 'Licensing never blocks:')
assert.equal(status.revokedEffect, documented.revoked_effect, "Core's own sentence")

// days_left null: Core's reason, no number of ours. A whole number is shown as days.
assert.equal(status.grace.daysLeft, null)
assert.equal(lic.graceLine(status.grace), documented.grace.reason)
assert.ok(!/\d/.test(lic.graceLine(status.grace).replace(documented.grace.reason, '')), 'no number is added')
assert.equal(lic.graceLine({ daysLeft: 5, reason: 'x' }), '5 days left in the grace window.')
assert.equal(lic.graceLine({ daysLeft: 1, reason: 'x' }), '1 day left in the grace window.')
assert.equal(lic.graceLine({ daysLeft: 2.5, reason: 'Because.' }), 'Because.', 'a fraction is never shown as a number')
assert.equal(lic.normalizeLicensingStatus({ grace: { days_left: 2.5, reason: 'r' } }).grace.daysLeft, null)
assert.equal(lic.normalizeLicensingStatus({ grace: { days_left: '7', reason: 'r' } }).grace.daysLeft, null, 'a string is not a number of days')

// every state has a sentence; an unknown one reads as unknown
for (const state of ['licensed', 'unlicensed', 'expired', 'revoked', 'unavailable', 'invalid', 'provisional', 'unknown', 'licensing_unavailable']) {
  assert.ok(lic.licenceSentence(state).length > 10, state)
  assert.equal(lic.licenceState(state), state)
}
assert.equal(lic.licenceState('banana'), 'unknown')
assert.equal(lic.licenceSentence('banana'), lic.licenceSentence('unknown'))
assert.equal(lic.normalizeLicensingStatus({ licence: { state: 'banana' } }).licenceState, 'unknown')

// the would-block list is cut at Core's 50 and the true count is kept
const many = Array.from({ length: 80 }, (_, i) => ({ module_id: `m${i}`, version: '1', state: 'unlicensed', reason: 'r' }))
const big = lic.normalizeLicensingStatus({ would_block: { count: 80, modules: many, limit: 50 } })
assert.equal(big.wouldBlock.modules.length, 50)
assert.equal(big.wouldBlock.count, 80)
assert.equal(big.wouldBlock.more, 30)
assert.equal(lic.normalizeLicensingStatus('nope'), null)

// ---- the PATCH: exactly one key; null resets ----
const sent = []
const api = async (path, options) => { sent.push({ path, options }); return { licensing_enforcement_mode: { value: 'enforce', source: 'setting', choices: ['off', 'log-only', 'enforce'], default: 'log-only' } } }
const saved = await lic.saveLicensingMode('enforce', { api })
assert.equal(sent[0].path, '/api/tfd/system/runtime-settings/')
assert.equal(sent[0].options.method, 'PATCH')
assert.deepEqual(JSON.parse(sent[0].options.body), { licensing_enforcement_mode: 'enforce' })
assert.deepEqual(Object.keys(JSON.parse(sent[0].options.body)), ['licensing_enforcement_mode'], 'no other key: Core refuses a mixed body')
assert.equal(saved.value, 'enforce')
await lic.saveLicensingMode(null, { api })
assert.deepEqual(JSON.parse(sent[1].options.body), { licensing_enforcement_mode: null }, 'null puts the mode back to the default')
await assert.rejects(() => lic.saveLicensingMode('sideways', { api }), /off, log only or enforce/)
assert.equal(sent.length, 2, 'a bad choice sends nothing')
assert.equal(settings.RUNTIME_SETTINGS_PATH, lic.RUNTIME_SETTINGS_PATH)
// Core's sentences are shown as sent
const refused = Object.assign(new Error('Only a superuser can change the licensing mode.'), { status: 403 })
await assert.rejects(() => lic.saveLicensingMode('off', { api: async () => { throw refused } }), /Only a superuser can change the licensing mode\./)

// ---- the confirm: a plain Yes or No, danger for enforce and off, nothing typed ----
assert.equal(lic.modeConfirmation('enforce').danger, true)
assert.equal(lic.modeConfirmation('off').danger, true)
assert.equal(lic.modeConfirmation('log-only').danger, false)
assert.equal(lic.modeConfirmation(null).danger, false)
assert.match(lic.modeConfirmation('enforce').detail, /sign-in, Tactical operations, rollback and security updates are never blocked/i)
const card = read('../src/components/LicensingCard.vue')
assert.match(card, /if \(!\(await askConfirm\(\{ question: ask\.question, detail: ask\.detail, danger: ask\.danger \}\)\)\) return/, 'Yes or No before anything is sent')
assert.ok(!/type="text"|type="password"|<textarea|v-model="typed|confirmText/.test(card), 'no typed confirmation')
assert.ok(card.indexOf('await askConfirm') < card.indexOf('await saveLicensingMode'), 'the confirm comes first')
assert.ok(!/localStorage|sessionStorage|console\./.test(card + read('../src/licensing.js')), 'nothing stored or logged')

// ---- the selector is for a superuser only ----
assert.equal(lic.canChangeLicensingMode({ user: { superuser: true } }), true)
assert.equal(lic.canChangeLicensingMode({ user: { superuser: false }, permissions: ['core.runtime_settings.manage', 'core.privileged_operations'] }), false, 'a manager with only the permission reads the mode')
assert.equal(lic.canChangeLicensingMode({}), false)
assert.equal(lic.canChangeLicensingMode(null), false)
assert.match(card, /<form v-if="canChange" class="runtime-settings-form" @submit\.prevent="change\(draft\)">/, 'the selector form needs canChange')
assert.match(card, /<p v-else class="compact-copy muted">Only a superuser can change the licensing mode\.<\/p>/, 'everyone else reads it')
assert.match(card, /Use Core's default/)
assert.match(card, /if \(saving\.value \|\| !canChange\.value\) return/, 'change() itself refuses a non-superuser')

// ---- 403 hides the panel, 404 hides the card ----
assert.deepEqual(await lic.getLicensingStatus({ api: async () => { throw Object.assign(new Error('no'), { status: 403 }) } }), { hidden: true })
assert.deepEqual(await lic.getLicensingStatus({ api: async () => { throw Object.assign(new Error('no'), { status: 404 }) } }), { hidden: true })
await assert.rejects(() => lic.getLicensingStatus({ api: async () => { throw Object.assign(new Error('Server down'), { status: 500 }) } }), /Server down/)
assert.ok((await lic.getLicensingStatus({ api: async () => documented })).status)
assert.deepEqual(await lic.getLicensingStatus({ api: async () => null }), { hidden: true })
assert.equal(await settings.getRuntimeSettingsPayload({ api: async () => { throw Object.assign(new Error('x'), { status: 404 }) } }), null, 'a 404 on runtime-settings gives no mode')
assert.match(card, /const visible = computed\(\(\) => loading\.value \|\| Boolean\(mode\.value\) \|\| Boolean\(status\.value\) \|\| Boolean\(loadError\.value\)\)/, 'the card hides when there is nothing to show')
assert.match(card, /<section v-if="visible"/)
assert.match(card, /<template v-if="status">/, 'the status panel needs a status')

// ---- only the allow-listed fields are rendered ----
assert.ok(!/status\.(licence_key|token|fingerprint|key)\b/.test(card), 'the card reads no key, token or fingerprint')
assert.ok(!/v-html|innerHTML/.test(card), 'Core text is shown as text')
for (const field of ['status.mode', 'status.licenceState', 'status.grace', 'status.wouldBlock', 'status.neverBlocked', 'status.revokedEffect']) assert.ok(card.includes(field), `${field} is shown`)

// ---- where it sits, and the existing cards stay ----
const view = read('../src/views/SystemSettingsView.vue')
assert.match(view, /<RuntimeSettingsCard v-if="allowed" \/>\s*<LicensingCard v-if="allowed" \/>/, 'under the runtime settings')
assert.match(view, /import LicensingCard from '\.\.\/components\/LicensingCard\.vue'/)
assert.match(read('../src/components/RuntimeSettingsCard.vue'), /onMounted\(load\)/, 'the runtime settings card is untouched')
console.log('licensing-controls-0.12.118: ok')
