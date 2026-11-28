// 0.13.10: the Console web address card accepts a bare host. Core stays the authority for every other address rule.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { RUNTIME_SETTINGS_PATH, prepareConsoleUiUrl, saveConsoleUiUrl, validateConsoleUiUrl } from '../src/runtime-settings.js'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const PLAIN = 'The web address must start with https://'

assert.equal(prepareConsoleUiUrl('rmm.tcrm.techxflow.net.za'), 'https://rmm.tcrm.techxflow.net.za')
assert.equal(prepareConsoleUiUrl('rmm.example.com:8443/tec-tac'), 'https://rmm.example.com:8443/tec-tac')
assert.equal(prepareConsoleUiUrl('host/tec-tac'), 'https://host/tec-tac')
assert.equal(prepareConsoleUiUrl('//rmm.example.com'), 'https://rmm.example.com')
assert.equal(prepareConsoleUiUrl('  HTTPS://Rmm.Example.com '), 'HTTPS://Rmm.Example.com')
assert.equal(prepareConsoleUiUrl('ftp://x'), 'ftp://x')
for (const empty of ['', '   ', null, undefined]) assert.equal(prepareConsoleUiUrl(empty), '')

for (const bad of ['http://x', 'HTTP://x', ' Http://x ']) {
  const check = validateConsoleUiUrl(bad)
  assert.equal(check.valid, false)
  assert.equal(check.message, PLAIN)
}
assert.equal(validateConsoleUiUrl('rmm.example.com').valid, true)
assert.equal(validateConsoleUiUrl('').valid, true)
assert.equal(validateConsoleUiUrl('x'.repeat(295)).valid, false, 'the prefix pushes it over 300')
assert.equal(validateConsoleUiUrl('x'.repeat(292)).valid, true)
assert.equal(validateConsoleUiUrl('ftp://x').valid, true, 'Core refuses other schemes')

const calls = []
const api = async (path, options) => { calls.push([path, options]); return { console_ui_url: { value: 'https://host/tec-tac/', maximum_length: 300, default: '' } } }
await saveConsoleUiUrl('host', { api })
assert.equal(calls[0][0], RUNTIME_SETTINGS_PATH)
assert.equal(calls[0][1].method, 'PATCH')
assert.equal(calls[0][1].body, '{"console_ui_url":"https://host"}')
assert.deepEqual(Object.keys(JSON.parse(calls[0][1].body)), ['console_ui_url'])
calls.length = 0
await assert.rejects(() => saveConsoleUiUrl('http://host', { api }), (error) => error.message === PLAIN)
assert.equal(calls.length, 0, 'http:// is never sent')
await saveConsoleUiUrl('   ', { api })
assert.equal(calls[0][1].body, '{"console_ui_url":null}')
await saveConsoleUiUrl('ftp://x', { api })
assert.equal(calls[1][1].body, '{"console_ui_url":"ftp://x"}', 'other schemes go to Core unchanged')
const refusal = Object.assign(new Error('Core says no.'), { status: 400 })
await assert.rejects(() => saveConsoleUiUrl('https://host/other-path', { api: async () => { throw refusal } }), (error) => error === refusal)

const card = read('../src/components/RuntimeSettingsCard.vue')
assert.ok(card.includes('Will be saved as'), 'preview text')
assert.match(card, /A bare host is fine and https:\/\/ is added/)
assert.ok(card.includes("error?.message || 'The address could not be saved.'"), 'error fallback')
assert.match(card, /await saveConsoleUiUrl\([^\n]*\)\s*\n\s*\/\/[^\n]*\n\s*await load\(\)/, 'load() runs after save')
assert.doesNotMatch(card, /confirm\(|useConfirm|context\.confirm/)
assert.doesNotMatch(card, /localStorage|sessionStorage/)
assert.doesNotMatch(read('../src/runtime-settings.js'), /localStorage|sessionStorage/)
console.log('console-ui-url-bare-host-0.13.10: PASS')
