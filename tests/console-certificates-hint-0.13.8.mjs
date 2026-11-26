// 0.13.8: the Console certificates page and its help article say how to find a certificate in the audit log.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { AUDIT_HINT } from '../src/console-certificates.js'

const article = fs.readFileSync(new URL('../src/help/articles/console-certificates.md', import.meta.url), 'utf8')
const page = fs.readFileSync(new URL('../src/views/ConsoleCertificatesView.vue', import.meta.url), 'utf8')
assert.match(page, /\{\{ AUDIT_HINT \}\}/)
for (const text of [AUDIT_HINT, article]) {
  for (const action of ['custom:console-cert-issued', 'custom:console-cert-revoked', 'custom:console-cert-refused']) assert.ok(text.includes(action), action)
  assert.match(text, /serial/i)
  assert.match(text, /audit/i)
  assert.match(text, /the long number that identifies/)
}
assert.doesNotMatch(AUDIT_HINT, /kindly|hesitate/i)
console.log('console-certificates-hint-0.13.8: PASS')
