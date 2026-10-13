// 0.12.102: the services registry fails closed. A service needs at least one permission (the module's own, the service's, or a
// Tactical flag). Outside a backend-supplied context every service is hidden and refused (AD-12). The shell passes the trust
// check from main.js; the docs say both rules.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { createModuleServiceRegistry } = await import(new URL('../src/module-services.js', import.meta.url).href)

const granted = new Set()
const flags = {}
let trusted = true
const registry = createModuleServiceRegistry({
  hasPermission: (code) => granted.has(code),
  hasTacticalPermission: (flag) => flags[flag],
  isTrustedContext: () => trusted,
})

// (1) a service with no permission at all is refused at provide(), with the plain fix
const bare = registry.forModule('bare')
assert.throws(
  () => bare.provide('bare.open', () => 'open'),
  (error) => error.message === 'Service bare.open needs at least one permission: declare one for the module or for this service.',
)
assert.throws(() => bare.provide('bare.open', () => 'open', { label: 'Open' }), /needs at least one permission/)
assert.throws(() => bare.provide('bare.open', () => 'open', { permissions: [] }), /needs at least one permission/)
assert.throws(() => bare.provide('bare.open', () => 'open', { tacticalPermission: [] }), /needs at least one permission/)
assert.equal(registry.list().some((item) => item.name === 'bare.open'), false, 'a refused service is not registered')

// (2) a module permission, a service permission or a Tactical flag each give a service that works
const withModule = registry.forModule('withmodule', { permissions: ['scripts.view'] })
granted.add('scripts.view')
withModule.provide('withmodule.run', () => 'module-ok')
assert.equal(await withModule.call('withmodule.run'), 'module-ok')

const withService = registry.forModule('withservice')
withService.provide('withservice.run', () => 'service-ok', { permission: 'scripts.run' })
assert.equal(withService.has('withservice.run'), false, 'the service permission is not held yet')
granted.add('scripts.run')
assert.equal(await withService.call('withservice.run'), 'service-ok')

flags.can_run_scripts = false
const withFlag = registry.forModule('withflag')
withFlag.provide('withflag.run', () => 'flag-ok', { tacticalPermission: 'can_run_scripts' })
assert.equal(withFlag.has('withflag.run'), false, 'a false flag hides it')
flags.can_run_scripts = true
assert.equal(await withFlag.call('withflag.run'), 'flag-ok')

// (3) outside a backend-supplied context: hidden, refused, and not listed
const consumer = registry.forModule('consumer', { permissions: [] })
trusted = false
assert.equal(consumer.has('withmodule.run'), false, 'hidden outside a backend context')
assert.deepEqual(consumer.list(), [], 'not listed outside a backend context')
await assert.rejects(consumer.call('withmodule.run'), (error) => error.code === 'service_denied')
trusted = true
assert.equal(consumer.has('withmodule.run'), true, 'shown again in a backend context')

// (4) the default is trusted, like the header registry: a registry built without the option still lists services
const plain = createModuleServiceRegistry({ hasPermission: () => true, hasTacticalPermission: () => true })
plain.forModule('plainp', { permissions: ['x.use'] }).provide('plainp.run', () => 1)
assert.equal(plain.forModule('plainc').has('plainp.run'), true)

// (5) the shell's main.js gives the trust check; the docs say both rules
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /isTrustedContext: \(\) => state\.contextSource === 'backend'/)
const source = fs.readFileSync(new URL('../src/module-services.js', import.meta.url), 'utf8')
assert.match(source, /if \(!isTrustedContext\(\)\) return false/)
const doc = fs.readFileSync(new URL('../docs/module-services.md', import.meta.url), 'utf8')
assert.match(doc, /at least one permission/)
assert.match(doc, /Outside a backend-supplied context/)
assert.match(doc, /hidden and refused/)

console.log('module services permissions 0.12.102: PASS')
