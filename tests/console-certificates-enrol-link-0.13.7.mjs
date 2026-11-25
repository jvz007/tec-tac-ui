// 0.13.7: Copy enrol link copies the whole tectac-console://enrol link, and the short serial is the first 8 characters.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { enrolLink, normalizeCertificate } from '../src/console-certificates.js'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const card = read('../src/components/ConsoleCertificatesCard.vue')
const revoke = read('../src/components/ConsoleCertificateRevoke.vue')
const helpers = read('../src/console-certificates.js')

assert.match(card, /copyTextWithFeedback\(link\.value/, 'copies the link')
assert.doesNotMatch(card, /copyTextWithFeedback\(issued\.value\.code/, 'not the bare code')
assert.match(card, /Copy enrol link/)
assert.match(card, /Enrol link copied\./)
assert.match(card, /Could not copy the enrol link\./)
assert.doesNotMatch(card, /Copy code|Code copied\./, 'no Copy code left')
assert.match(card, /<button v-if="link"[^>]*@click="copyCode">Copy enrol link<\/button>/, 'the copy button needs a valid link')
assert.match(card, /choose Enrol, and enter this host and code by hand/, 'hand-entry hint stays')
assert.match(card, /console-cert-code">\{\{ issued\.code \}\}/, 'the code is still shown')
assert.doesNotMatch(card, /localStorage|sessionStorage|router\.(push|replace)|\$router|useRouter|console\.(log|info|warn|error)/)

const code = 'A'.repeat(43)
assert.equal(enrolLink('dev02.example.co.za', code), `tectac-console://enrol?host=dev02.example.co.za&code=${code}`)
assert.equal(enrolLink('bad host/x', code), '')
assert.equal(enrolLink('dev02.example.co.za', 'short'), '')

const serial = 'abcdefgh' + 'z'.repeat(24)
assert.equal(normalizeCertificate({ serial }).short_serial, 'abcdefgh')
assert.equal(normalizeCertificate({ serial, short_serial: 'fromcore' }).short_serial, 'fromcore')
assert.match(revoke, /props\.serial\.slice\(0, 8\)/)
assert.doesNotMatch(revoke, /slice\(-8\)/)
assert.doesNotMatch(helpers, /slice\(-8\)/)
console.log('console-certificates-enrol-link-0.13.7: PASS')
