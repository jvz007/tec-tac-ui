// 0.12.97: the sign-in step that asks for the password again reads as an instruction, not an error. The security rule is
// unchanged: the password field is cleared when the step opens, an empty password is refused, the enrollment call carries
// the freshly entered password, and the seed is never in the setup-proof template.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}
const srcRoot = new URL('../src', import.meta.url)
for (const file of walk(srcRoot.pathname.replace(/^\/([A-Za-z]:)/, '$1').replaceAll('%20', ' '))) {
  assert.ok(!fs.readFileSync(file, 'utf8').includes('Fresh password proof required'), `${file} still carries the old banner`)
}

const login = read('../src/components/LoginPanel.vue')
const proofStart = login.indexOf(`v-else-if="step === 'setup-proof'"`)
const proofEnd = login.indexOf('</form>', proofStart)
assert.ok(proofStart > 0 && proofEnd > proofStart)
const proof = login.slice(proofStart, proofEnd)
assert.ok(proof.includes('Set up two-factor sign-in.'))
assert.ok(proof.includes('Enter your password again to show your authenticator code.'))
assert.ok(!/warning|pill warn/.test(proof), 'the setup-proof step has no warning styling')
assert.ok(proof.includes('class="state-inline"'))
assert.ok(proof.includes('<span class="pill">SETUP SESSION</span>'))
assert.ok(proof.includes('Show my authenticator code'))
// The password rule.
assert.match(login, /if \(result\.requiresTotpSetup\) \{[\s\S]*?password\.value = ''[\s\S]*?step\.value = 'setup-proof'/)
assert.match(login, /async function beginTotpSetup\(\) \{[\s\S]*?if \(!password\.value\) \{[\s\S]*?return\s*\}/)
assert.ok(login.includes('await setupTacticalTotp(password.value)'))
assert.ok(!/totp_key|setupKey|qrSrc|qr_svg/.test(proof), 'no seed in the setup-proof template')
assert.ok(proof.includes(':disabled="busy || !password"'))

const account = read('../src/views/MyAccountView.vue')
assert.ok(account.includes('At your next sign-in you set up two-factor again: enter your password again to show your new authenticator code.'))
assert.ok(account.includes('This signs out every session.'))

console.log('sign-in setup wording 0.12.97: ok')
