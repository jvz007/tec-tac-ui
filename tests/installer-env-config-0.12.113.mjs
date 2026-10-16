// 0.12.113: the env-config.js the installer writes is valid JavaScript that sets window._env_.PROD_URL, and src/api.js apiBase() turns
// it into the API base with no double slash. The installer's own test (installer-env-config-0.12.113.sh) covers the shell side.
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'

const printf = (url) => `window._env_ = {\n  PROD_URL: "${url}"\n};\n`
const sandbox = { window: {} }
vm.createContext(sandbox)
vm.runInContext(printf('https://api.example.com'), sandbox)
assert.equal(sandbox.window._env_.PROD_URL, 'https://api.example.com')

// the same apiBase() logic as src/api.js, read from the source so a change there is noticed
const src = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')
const m = src.match(/export function apiBase\(\) \{\s*return ([^\n]+)\n\}/)
assert.ok(m, 'apiBase() was not found in src/api.js')
const apiBase = vm.runInContext(`(function () { return ${m[1]} })`, sandbox)
assert.equal(apiBase(), 'https://api.example.com')
assert.equal(`${apiBase()}/api/tfd/ui/context/`, 'https://api.example.com/api/tfd/ui/context/')

// the installer already removed trailing slashes; a prefix path still joins cleanly
vm.runInContext(printf('https://host.example.com/prefix'), sandbox)
assert.equal(`${apiBase()}/accounts/login/`, 'https://host.example.com/prefix/accounts/login/')

// the README and the installer name the variable
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8')
assert.match(readme, /TEC_TAC_API_URL/)
assert.match(readme, /curl -ksS/)
console.log('installer-env-config-0.12.113: PASS')
