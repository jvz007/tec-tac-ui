import assert from 'node:assert/strict'
import fs from 'node:fs'

import { copyTextToClipboard } from '../src/clipboard.js'
import { enrollmentSetupErrorMessage } from '../src/mfa-enrollment.js'

// L64: clipboard success, unavailable API and rejected write all produce deterministic behavior.
let copied = ''
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text) => { copied = text } } } })
await copyTextToClipboard('hello')
assert.equal(copied, 'hello')
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
await assert.rejects(() => copyTextToClipboard('x'), /Clipboard access is unavailable/)
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denied') } } } })
await assert.rejects(() => copyTextToClipboard('x', { failureMessage: 'copy failed' }), /copy failed/)

// L65: non-auth enrollment failures explain the one-time response/reset recovery path.
const normalize = (err) => err?.message || 'Authentication failed.'
assert.match(enrollmentSetupErrorMessage({ status: 502, message: 'response lost' }, normalize), /administrator to reset 2FA/)
assert.doesNotMatch(enrollmentSetupErrorMessage({ status: 401, message: 'bad password' }, normalize), /reset 2FA/)

// L66: both normal module intake and hotfix intake reject duplicate sidecars.
let modulesSource = fs.readFileSync(new URL('../src/modules.js', import.meta.url), 'utf8')
modulesSource = modulesSource.replace("import { apiFetch } from './api'", "const apiFetch = async () => ({ ok: true })")
const modules = await import(`data:text/javascript;base64,${Buffer.from(modulesSource).toString('base64')}`)
const file = (name) => ({ name })
assert.throws(() => modules.inspectModulePackages([file('a.zip'), file('a.sig'), file('b.sig')]), /exactly one detached signature/)
assert.throws(() => modules.inspectModulePackages([file('a.zip'), file('a.release.json'), file('b.release.json')]), /exactly one release metadata/)
assert.throws(() => modules.inspectModuleHotfix([file('a.zip'), file('a.sig'), file('b.sig')]), /exactly one detached signature/)
assert.throws(() => modules.inspectModuleHotfix([file('a.zip'), file('a.release.json'), file('b.release.json')]), /exactly one release metadata/)

console.log('ui-hygiene-0.12.45: PASS')
