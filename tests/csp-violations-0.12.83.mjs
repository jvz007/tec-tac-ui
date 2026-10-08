// 0.12.83: the browser policy violation recorder.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createCspViolationRecorder, installCspViolationRecorder, blockedOrigin, CSP_VIOLATION_LIMIT } from '../src/csp-violations.js'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

// Storage must never be touched.
let touched = false
const trap = { get() { touched = true; throw new Error('storage touched') } }
Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: trap.get })
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: trap.get })

const logs = []
const recorder = createCspViolationRecorder({ route: () => '/system/diagnostics', log: (line) => logs.push(line) })
const target = new EventTarget()
installCspViolationRecorder(target, recorder)

function fire(init) {
  const event = new Event('securitypolicyviolation')
  Object.assign(event, init)
  target.dispatchEvent(event)
}

fire({ effectiveDirective: 'connect-src', violatedDirective: 'connect-src \'self\'', disposition: 'report', blockedURI: 'https://api.x.test:8443/secret/path?token=abc#frag' })
let list = recorder.list()
assert.equal(list.length, 1)
assert.equal(list[0].directive, 'connect-src')
assert.equal(list[0].disposition, 'report')
assert.equal(list[0].blocked, 'https://api.x.test:8443', 'path, query and fragment are stripped')
assert.equal(list[0].route, '/system/diagnostics')
assert.ok(!JSON.stringify(list).includes('token'), 'no query value is kept')
assert.equal(logs.length, 1)
assert.match(logs[0], /would block/)

// De-duplicates: same directive, disposition and origin counts up, logs once.
fire({ effectiveDirective: 'connect-src', disposition: 'report', blockedURI: 'https://api.x.test:8443/other' })
assert.equal(recorder.list().length, 1)
assert.equal(recorder.list()[0].count, 2)
assert.equal(logs.length, 1)

// Enforced blocks are labelled; keywords and schemes survive.
fire({ effectiveDirective: 'script-src', disposition: 'enforce', blockedURI: 'inline' })
fire({ effectiveDirective: 'img-src', disposition: 'enforce', blockedURI: 'data:image/png;base64,AAAA' })
assert.equal(recorder.list()[0].blocked, 'data:')
assert.equal(recorder.list()[1].blocked, 'inline')
assert.equal(recorder.list()[1].disposition, 'enforce')
assert.match(logs[1], /blocked/)

// Malformed events do not throw or record.
fire({})
fire({ blockedURI: { toString() { throw new Error('bad') } }, effectiveDirective: 'x-src' })
assert.doesNotThrow(() => recorder.record(null))
assert.doesNotThrow(() => recorder.record(undefined))
assert.equal(blockedOrigin('not a url ::'), '')

// Cap at 20, newest first.
for (let index = 0; index < 30; index += 1) fire({ effectiveDirective: 'connect-src', disposition: 'report', blockedURI: `https://h${index}.test/x` })
list = recorder.list()
assert.equal(CSP_VIOLATION_LIMIT, 20)
assert.equal(list.length, 20)
assert.equal(list[0].blocked, 'https://h29.test')

// Summary text and subscription.
let pings = 0
const stop = recorder.subscribe(() => { pings += 1 })
fire({ effectiveDirective: 'frame-src', disposition: 'report', blockedURI: 'http://frame.test/a' })
assert.equal(pings, 1)
stop()
assert.match(recorder.summary(), /frame-src http:\/\/frame\.test/)
recorder.clear()
assert.equal(recorder.list().length, 0)

assert.equal(touched, false, 'the recorder must not read localStorage or sessionStorage')

// Source checks: installed before mount; Diagnostics shows the card.
const main = read('../src/main.js')
assert.ok(main.indexOf('installCspViolationRecorder()') > -1 && main.indexOf('installCspViolationRecorder()') < main.indexOf("app.mount('#app')"), 'listener installed before mount')
const recorderSource = read('../src/csp-violations.js')
assert.ok(!/localStorage|sessionStorage/.test(recorderSource.replace(/\/\/.*$/gm, '')), 'no storage use in the recorder')
const view = read('../src/views/DiagnosticsView.vue')
assert.match(view, /Recent browser policy blocks/)
assert.match(view, /copyPolicyBlocks/)
assert.match(read('../src/help/articles/troubleshooting-diagnostics.md'), /Recent browser policy blocks/)
console.log('[TEST] PASS CSP violation recorder')
