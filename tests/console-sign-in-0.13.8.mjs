// 0.13.8: Engineer Console sign-in page (#/console/sign-in): query validation, the loopback address, Yes/No, no kept code.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { authoriseBody, loopbackCallbackUrl, parseSignInQuery } from '../src/console-handoff.js'
import { findActiveCertificate, normalizeMine } from '../src/console-certificates.js'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const S43 = 'A'.repeat(42) + '-'
const C43 = 'b_'.repeat(21) + 'c'
const SERIAL = 'ab12'.repeat(8)
const good = { port: '40123', state: S43, challenge: C43, serial: SERIAL }

assert.deepEqual(parseSignInQuery(good), { port: 40123, state: S43, challenge: C43, serial: SERIAL })
for (const port of ['1024', '65535']) assert.ok(parseSignInQuery({ ...good, port }), port)
for (const port of ['0', '1023', '65536', '8080abc', '08080', '-1', '1e4', ' 8080', true, 40000.5, '40000.5', '0x1f90', '', undefined, ['40123']]) {
  assert.equal(parseSignInQuery({ ...good, port }), null, `port ${String(port)} refused`)
}
for (const bad of [S43.slice(1), S43 + 'A', S43.replace('-', '+'), S43.replace('-', '='), '', null, undefined, [S43]]) {
  assert.equal(parseSignInQuery({ ...good, state: bad }), null)
  assert.equal(parseSignInQuery({ ...good, challenge: bad }), null)
}
for (const bad of [SERIAL.slice(1), SERIAL + 'a', SERIAL.toUpperCase(), 'g'.repeat(32), '']) assert.equal(parseSignInQuery({ ...good, serial: bad }), null)
assert.equal(parseSignInQuery(null), null)

// The loopback address: literal scheme, host and path; hostile values stay inside the encoded query.
for (const hostile of ['@evil.com', '//evil.com', '\\\\evil', '%0d%0a', '#frag', 'a&port=1&x=2', '?x=1']) {
  for (const url of [loopbackCallbackUrl(40123, hostile, S43), loopbackCallbackUrl(40123, 'code', hostile)]) {
    const parsed = new URL(url)
    assert.equal(parsed.origin, 'http://127.0.0.1:40123')
    assert.equal(parsed.pathname, '/callback')
    assert.equal(parsed.hash, '')
    assert.deepEqual([...parsed.searchParams.keys()], ['code', 'state'])
    assert.match(url, /^http:\/\/127\.0\.0\.1:40123\/callback\?code=[^&#?]*&state=[^&#?]*$/)
  }
}
assert.throws(() => loopbackCallbackUrl(80, 'c', 's'))
assert.throws(() => loopbackCallbackUrl('40123', 'c', 's'))
assert.throws(() => loopbackCallbackUrl(40123, '', 's'))

const body = authoriseBody(parseSignInQuery(good))
assert.deepEqual(Object.keys(body).sort(), ['code_challenge', 'redirect_port', 'serial'])
assert.equal(Number.isInteger(body.redirect_port), true)
assert.equal(body.code_challenge, C43)

// Unknown, revoked and expired certificates are not offered.
const mine = normalizeMine({
  certificates: [
    { serial: SERIAL, state: 'active', pc_label: 'Work PC' },
    { serial: 'c'.repeat(32), state: 'revoked' },
    { serial: 'd'.repeat(32), state: 'expired' },
  ],
  host: 'dev02.example.co.za',
})
assert.equal(findActiveCertificate(mine, SERIAL).pc_label, 'Work PC')
assert.equal(findActiveCertificate(mine, 'c'.repeat(32)), null)
assert.equal(findActiveCertificate(mine, 'd'.repeat(32)), null)
assert.equal(findActiveCertificate(mine, 'e'.repeat(32)), null)
assert.equal(findActiveCertificate(null, SERIAL), null)

// Source scans.
const view = read('../src/views/ConsoleSignInView.vue')
const script = view.split('<template>')[0]
assert.doesNotMatch(view, /localStorage|sessionStorage|console\.(log|info|warn|error|debug)|\$router|useRouter|router\.(push|replace)|v-html|Authorization|headers/)
assert.doesNotMatch(script, /ref\([^)]*code|reactive/i, 'the code is never put in a ref or state')
assert.match(script, /const answer = await apiFetch\('\/api\/tfd\/console-sessions\/authorise\/', \{ method: 'POST', body: JSON\.stringify\(authoriseBody\(parsed\)\) \}\)/)
assert.match(script, /loopbackCallbackUrl\(parsed\.port, typeof answer\?\.code === 'string' \? answer\.code : '', parsed\.state\)/)
assert.match(script, /window\.location\.assign\(target\)/)
assert.doesNotMatch(view, /127\.0\.0\.1/, 'only the helper builds the loopback address')
assert.match(script, /useConfirm\(\)/)
assert.match(script, /danger: false, yesLabel: 'Yes', noLabel: 'No'/)
assert.doesNotMatch(view, /<input|<textarea|<select/, 'no typed confirmation')
assert.match(script, /Nothing was sent\./)
assert.match(view, /You can close this tab once the Engineer Console says it is signed in\./)
assert.match(script, /serial_not_allowed/)
assert.match(script, /window\.close\(\)/)
assert.match(script, /not one of yours, or it has ended/)
// A refused query never loads or sends anything.
assert.match(script, /if \(parsed\) void load\(\)/)
const router = read('../src/router.js')
assert.match(router, /path: '\/console\/sign-in', name: 'console-sign-in', component: ConsoleSignInView, meta: \{ title: 'Engineer Console sign-in' \}/)
assert.doesNotMatch(router.match(/path: '\/console\/sign-in'[^\n]*/)[0], /public|popup/)
for (const file of ['../src/console-handoff.js', '../src/views/ConsoleSignInView.vue', '../src/views/ConsoleEnrolView.vue']) {
  assert.equal(read(file).includes('\r'), false)
}
const others = fs.readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter((f) => /\.(js|vue)$/.test(f) && !/console-handoff\.js$/.test(f))
for (const f of others) assert.doesNotMatch(read(`../src/${f}`), /http:\/\/127\.0\.0\.1:\$\{/, `${f} does not build the loopback address`)
console.log('console-sign-in-0.13.8: PASS')
