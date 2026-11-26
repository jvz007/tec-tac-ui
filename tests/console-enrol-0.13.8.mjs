// 0.13.8: Engineer Console enrol page (#/console/enrol) and the optional PKCE body of requestEnrolmentCode.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { enrolBody, loopbackCallbackUrl, parseEnrolQuery } from '../src/console-handoff.js'
import { requestEnrolmentCode } from '../src/console-certificates.js'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const S = 'A'.repeat(43)
const C = 'B'.repeat(43)

let seen
const api = async (path, options) => { seen = { path, options }; return { code: 'x' } }
await requestEnrolmentCode({ api })
assert.deepEqual(seen, { path: '/api/tfd/console-certificates/mine/enrolment-code/', options: { method: 'POST' } }, 'no argument: no body, as before')
await requestEnrolmentCode({ api, body: { code_challenge: C } })
assert.equal(seen.options.method, 'POST')
assert.equal(seen.options.body, JSON.stringify({ code_challenge: C }))

assert.deepEqual(parseEnrolQuery({ port: '40123', state: S, challenge: C }), { port: 40123, state: S, challenge: C })
assert.equal(parseEnrolQuery({ port: '40123', state: S }), null)
assert.equal(parseEnrolQuery({ port: '1023', state: S, challenge: C }), null)
assert.equal(parseEnrolQuery({ port: '40123', state: S, challenge: 'short' }), null)
assert.deepEqual(Object.keys(enrolBody({ port: 40123, state: S, challenge: C })), ['code_challenge'])
assert.equal(loopbackCallbackUrl(40123, 'abc', S), `http://127.0.0.1:40123/callback?code=abc&state=${S}`)

const view = read('../src/views/ConsoleEnrolView.vue')
const script = view.split('<template>')[0]
assert.doesNotMatch(view, /localStorage|sessionStorage|console\.(log|info|warn|error|debug)|\$router|useRouter|router\.(push|replace)|v-html|Authorization|headers|127\.0\.0\.1|<input/)
assert.doesNotMatch(script, /ref\([^)]*code|reactive/i)
assert.match(script, /requestEnrolmentCode\(\{ body: enrolBody\(parsed\) \}\)/)
assert.match(script, /loopbackCallbackUrl\(parsed\.port, typeof answer\?\.code === 'string' \? answer\.code : '', parsed\.state\)/)
assert.match(script, /window\.location\.assign\(target\)/)
assert.match(script, /An administrator must allow you to enrol first\. Ask them to allow you in Access > Console certificates\./)
assert.match(script, /!mine\.enrolment \|\| mine\.enrolment\.state !== 'open'/)
assert.match(script, /enrolment_required/)
assert.match(script, /consoleCertificateError/, 'other Core text is shown as sent')
assert.match(script, /danger: false, yesLabel: 'Yes', noLabel: 'No'/)
assert.match(script, /if \(parsed\) void load\(\)/)
assert.match(script, /Nothing was sent\./)
assert.match(read('../src/router.js'), /path: '\/console\/enrol', name: 'console-enrol', component: ConsoleEnrolView/)
// The My Account card keeps the no-challenge path.
assert.match(read('../src/components/ConsoleCertificatesCard.vue'), /await requestEnrolmentCode\(\)/)
console.log('console-enrol-0.13.8: PASS')
