// 0.13.6: the System Configuration card for console_certificate_validity_days (Core 1.18.52).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  canEditConsoleCertValidity,
  normalizeConsoleCertValidity,
  saveConsoleCertValidity,
  validateConsoleCertValidity,
} from '../src/runtime-settings.js'

const card = fs.readFileSync(new URL('../src/components/RuntimeSettingsCard.vue', import.meta.url), 'utf8')

assert.deepEqual(normalizeConsoleCertValidity({ console_certificate_validity_days: { value: 90, minimum: 1, maximum: 730, default: 365 } }), { value: 90, minimum: 1, maximum: 730, default: 365 })
assert.deepEqual(normalizeConsoleCertValidity({ console_certificate_validity_days: {} }), { value: 365, minimum: 1, maximum: 730, default: 365 }, 'bad fields fall back')
assert.equal(normalizeConsoleCertValidity({}), null, 'absent key (older Core)')
assert.equal(normalizeConsoleCertValidity(null), null)
assert.equal(normalizeConsoleCertValidity({ console_certificate_validity_days: 'x' }), null)

for (const bad of [0, 731, 1.5, '365', null, NaN, undefined, true, -1]) assert.equal(validateConsoleCertValidity(bad).valid, false, `rejects ${String(bad)}`)
for (const good of [1, 365, 730]) assert.equal(validateConsoleCertValidity(good).valid, true, `accepts ${good}`)

const calls = []
const api = async (path, options = {}) => { calls.push({ path, options }); return { console_certificate_validity_days: { value: 30, minimum: 1, maximum: 730, default: 365 } } }
const saved = await saveConsoleCertValidity(30, { api })
assert.equal(saved.value, 30)
assert.equal(calls.length, 1)
assert.equal(calls[0].path, '/api/tfd/system/runtime-settings/')
assert.equal(calls[0].options.method, 'PATCH')
assert.equal(calls[0].options.body, '{"console_certificate_validity_days":30}')
await assert.rejects(() => saveConsoleCertValidity(null, { api }))
await assert.rejects(() => saveConsoleCertValidity(731, { api }))
assert.equal(calls.length, 1, 'nothing invalid or null is sent')
assert.doesNotMatch(card, /saveConsoleCertValidity\(null/, 'null is never sent')
const certSection = card.slice(card.indexOf('console-cert-validity-title'), card.indexOf('console-ui-url-title'))
assert.doesNotMatch(certSection, /Reset to default/, 'no reset button on this card')

assert.equal(canEditConsoleCertValidity({ user: { superuser: true } }), true)
assert.equal(canEditConsoleCertValidity({ user: {}, permissions: ['core.runtime_settings.manage', 'core.privileged_operations'] }), false, 'only a superuser edits it')
assert.match(card, /<form v-if="canEditCert"/, 'the form shows only behind the superuser check')
assert.match(card, /Only a superuser can change this\./)
assert.match(card, /<section v-if="!loading && consoleCert"/, 'the card is absent when the key is missing')
assert.match(card, /affects new certificates only/i)
assert.match(card, /not ones already issued/)
assert.match(card, /await load\(\)\s*\n\s*certSaved/, 'reloads from Core after saving')
console.log('console-certificate-validity-0.13.6: PASS')
