// 0.13.9: the Console web address field (Core 1.18.58). Core stays the authority for the address rules.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CONSOLE_UI_URL_KEY, RUNTIME_SETTINGS_PATH, canEditConsoleUiUrl, normalizeConsoleUiUrl, saveConsoleUiUrl, validateConsoleUiUrl } from '../src/runtime-settings.js'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
assert.equal(CONSOLE_UI_URL_KEY, 'console_ui_url')

assert.deepEqual(normalizeConsoleUiUrl({ console_ui_url: { value: 'https://rmm.example.com/tec-tac/', maximum_length: 300, default: '' } }), { value: 'https://rmm.example.com/tec-tac/', maximum_length: 300, default: '' })
assert.deepEqual(normalizeConsoleUiUrl({ console_ui_url: { value: '', maximum_length: 300, default: '' } }), { value: '', maximum_length: 300, default: '' })
assert.deepEqual(normalizeConsoleUiUrl({ console_ui_url: { value: 5, maximum_length: 'x', default: 7 } }), { value: '', maximum_length: 300, default: '' })
for (const bad of [null, undefined, {}, 'x', [], { console_ui_url: null }, { console_ui_url: 'x' }, { console_ui_url: [] }]) assert.equal(normalizeConsoleUiUrl(bad), null)

assert.equal(validateConsoleUiUrl('').valid, true)
assert.equal(validateConsoleUiUrl('   ').valid, true)
assert.equal(validateConsoleUiUrl('x'.repeat(300)).valid, true)
assert.equal(validateConsoleUiUrl('x'.repeat(301)).valid, false)
assert.equal(validateConsoleUiUrl('http://example.org').valid, true, 'the address rules stay with Core')
assert.equal(validateConsoleUiUrl('x'.repeat(11), { maximum: 10 }).valid, false)

assert.equal(canEditConsoleUiUrl({ user: { superuser: true } }), true)
for (const ctx of [{ user: { superuser: false } }, { user: { superuser: 'true' } }, { user: {} }, { permissions: ['core.runtime_settings.manage'] }, {}, undefined]) assert.equal(canEditConsoleUiUrl(ctx), false)

const calls = []
const api = async (path, options) => { calls.push([path, options]); return { console_ui_url: { value: 'https://rmm.example.com/tec-tac/', maximum_length: 300, default: '' } } }
const result = await saveConsoleUiUrl('  https://rmm.example.com  ', { api })
assert.equal(calls.length, 1)
assert.equal(calls[0][0], RUNTIME_SETTINGS_PATH)
assert.equal(calls[0][1].method, 'PATCH')
assert.equal(calls[0][1].body, '{"console_ui_url":"https://rmm.example.com"}')
assert.equal(result.value, 'https://rmm.example.com/tec-tac/')
for (const empty of ['', '   ', null, undefined]) {
  calls.length = 0
  await saveConsoleUiUrl(empty, { api })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].body, '{"console_ui_url":null}')
}
const refusal = Object.assign(new Error('Use https.'), { status: 400 })
await assert.rejects(() => saveConsoleUiUrl('http://x', { api: async () => { throw refusal } }), (error) => error === refusal)

const card = read('../src/components/RuntimeSettingsCard.vue')
assert.match(card, /<section v-if="!loading && consoleUi"/)
assert.match(card, /<form v-if="canEditUiUrl"/)
assert.match(card, /Only a superuser can change this\./)
for (const text of ['https only', '/tec-tac', 'Empty text resets it', "Tactical's CORS settings", 'Reset to default']) assert.ok(card.includes(text), text)
assert.doesNotMatch(card, /confirm\(|useConfirm|context\.confirm|Yes\b.*\bNo\b/, 'no Yes/No dialog')
assert.doesNotMatch(card, /localStorage|sessionStorage/)
assert.doesNotMatch(read('../src/runtime-settings.js'), /localStorage|sessionStorage/)
console.log('console-ui-url-0.13.9: PASS')
