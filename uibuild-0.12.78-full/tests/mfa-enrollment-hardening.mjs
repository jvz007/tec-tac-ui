import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..')
const api=fs.readFileSync(path.join(root,'src/api.js'),'utf8')
const login=fs.readFileSync(path.join(root,'src/components/LoginPanel.vue'),'utf8')
assert.match(api,/auth\/totp\/enrollment/)
assert.match(api,/JSON\.stringify\(\{ password:/)
assert.match(api,/clearTacticalSession\(\)/)
assert.doesNotMatch(api,/accounts\/users\/setup_totp/)
assert.doesNotMatch(api,/auth\/totp\/qr/)
assert.doesNotMatch(login,/fetchTacticalTotpQr/)
assert.match(login,/step\.value = 'setup-proof'/)
assert.match(login,/Re-enter current password/)
assert.match(login,/setupTacticalTotp\(password\.value\)/)
assert.match(login,/new Blob\(\[result\.qr_svg\]/)
assert.match(login,/ONE-TIME ENROLLMENT/)
console.log('ui mfa enrollment hardening regression: PASS')
