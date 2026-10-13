// 0.12.97 (Core 1.17.23): the system name. Core settings can read, save and reset it; the authenticator issuer is the name
// Core returned in the enrollment answer, then the context's system_name, then 'Tec-Tac', never the host or '/tec-tac'.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
// runtime-settings.js imports apiFetch from api.js; a stub keeps the test free of the browser.
const settingsSource = read('../src/runtime-settings.js').replace("import { apiFetch } from './api.js'", 'const apiFetch = async () => { throw new Error("no api") }')
const settings = await import(dataUrl(settingsSource))
const apiSource = read('../src/api.js')
const issuerSource = apiSource.slice(apiSource.indexOf('export const TOTP_ISSUER_DEFAULT'), apiSource.indexOf('export function tacticalToken'))
const { tecTacTotpIssuer } = await import(dataUrl(issuerSource))

// (1) normalizeSystemName.
assert.deepEqual(settings.normalizeSystemName({ system_name: { value: 'Acme IT', maximum_length: 60, default: 'Tec-Tac' } }), { value: 'Acme IT', maximum_length: 60, default: 'Tec-Tac' })
assert.equal(settings.normalizeSystemName({ module_register_timeout_seconds: {} }), null, 'an older Core sends none')
assert.equal(settings.normalizeSystemName(null), null)
assert.equal(settings.normalizeSystemName({ system_name: 'Acme' }), null, 'a malformed entry')
assert.equal(settings.normalizeSystemName({ system_name: { value: 7 } }), null)
assert.deepEqual(settings.normalizeSystemName({ system_name: { value: 'A', maximum_length: 'x', default: '' } }), { value: 'A', maximum_length: 60, default: 'Tec-Tac' })
assert.equal(settings.SYSTEM_NAME_MAX, 60)
assert.equal(settings.SYSTEM_NAME_DEFAULT, 'Tec-Tac')

// (2) The PATCH bodies are exact.
const calls = []
const fakeApi = (answer) => async (path, options) => { calls.push({ path, options }); return answer }
const answer = { system_name: { value: 'Acme IT', maximum_length: 60, default: 'Tec-Tac' } }
const saved = await settings.saveSystemName('  Acme IT ', { api: fakeApi(answer) })
assert.equal(saved.value, 'Acme IT')
assert.equal(calls[0].path, '/api/tfd/system/runtime-settings/')
assert.equal(calls[0].options.method, 'PATCH')
assert.equal(calls[0].options.body, JSON.stringify({ system_name: 'Acme IT' }))
await settings.resetSystemName({ api: fakeApi({ system_name: { value: 'Tec-Tac', maximum_length: 60, default: 'Tec-Tac' } }) })
assert.equal(calls[1].options.method, 'PATCH')
assert.equal(calls[1].options.body, JSON.stringify({ system_name: null }))
assert.equal(calls[1].options.body, '{"system_name":null}')

// (3) Core's refusal reaches the caller unchanged.
for (const text of ['The name cannot contain a colon.', 'The name must be 1 to 60 characters.', 'Enter a name for this system.']) {
  const failing = async () => { throw Object.assign(new Error(text), { status: 400 }) }
  await assert.rejects(() => settings.saveSystemName('Acme', { api: failing }), (error) => error.message === text && error.status === 400)
}
const forbidden = async () => { throw Object.assign(new Error('You do not have permission to change this.'), { status: 403 }) }
await assert.rejects(() => settings.resetSystemName({ api: forbidden }), (error) => error.message === 'You do not have permission to change this.')

// (4) Client validation refuses the obvious and does not block a plain name; nothing is sent when it refuses.
for (const bad of ['', '   ', 'x'.repeat(61), 'A:B', 'A\u0007B', 'A​B', 'A \u0085B', 'A﻿B', 'A B', null, 7]) {
  assert.equal(settings.validateSystemName(bad).valid, false, JSON.stringify(bad))
}
for (const good of ['Acme IT', 'x'.repeat(60), 'Tech Flow Dynamics', 'Zuid-Afrika & Co', 'Wêreld']) {
  assert.equal(settings.validateSystemName(good).valid, true, good)
}
const before = calls.length
await assert.rejects(() => settings.saveSystemName('A:B', { api: fakeApi(answer) }), /colon/)
assert.equal(calls.length, before, 'a refused name is never sent')

// (5) tecTacTotpIssuer: answer issuer, then context name, then 'Tec-Tac'; never the host, '/tec-tac' or a colon.
assert.equal(tecTacTotpIssuer({ answer: { issuer: 'Acme IT' }, context: { system_name: 'Other' } }), 'Acme IT')
assert.equal(tecTacTotpIssuer({ answer: {}, context: { system_name: 'Other' } }), 'Other')
assert.equal(tecTacTotpIssuer({ answer: null, context: { system_name: '' } }), 'Tec-Tac')
assert.equal(tecTacTotpIssuer({}), 'Tec-Tac')
assert.equal(tecTacTotpIssuer(), 'Tec-Tac')
assert.equal(tecTacTotpIssuer({ answer: { issuer: 'A:B' } }), 'A-B')
for (const value of [tecTacTotpIssuer(), tecTacTotpIssuer({ answer: { issuer: 'Acme' } }), tecTacTotpIssuer({ context: { system_name: 'x' } })]) {
  assert.ok(!value.includes(':') && !value.includes('/tec-tac') && !/localhost|\.test|\.co\.za/.test(value), value)
}
assert.ok(!/url\.hostname|tecTacUiBaseUrl\(\)\)/.test(issuerSource), 'the address-derived code is gone')
assert.ok(apiSource.includes('export function tecTacTotpIssuer'), 'still exported')

// (6) Source assertions.
const card = read('../src/components/RuntimeSettingsCard.vue')
assert.ok(card.includes('canEditRuntimeSettings(state?.context)'))
assert.match(card, /<form v-if="canEdit" class="runtime-settings-form" @submit\.prevent="changeName\('save'\)">/)
assert.match(card, /v-if="!loading && systemName"/)
assert.ok(card.includes('Core 1.17.23'))
assert.ok(apiSource.includes('ui_url: tecTacUiBaseUrl()'), 'setupTacticalTotp still sends ui_url for older Cores')
assert.ok(apiSource.includes("!data.totp_key || !data.qr_url || !data.qr_svg"), 'the answer check stays')
const login = read('../src/components/LoginPanel.vue')
assert.ok(login.includes('tecTacTotpIssuer({ answer: setup.value })'))
assert.ok(login.includes('In your authenticator the account is listed as'))
const account = read('../src/views/MyAccountView.vue')
assert.ok(account.includes('tecTacTotpIssuer({ context: state.context })'))
assert.ok(read('../src/runtime-context.js').includes('system_name'))

console.log('system name 0.12.97: ok')
