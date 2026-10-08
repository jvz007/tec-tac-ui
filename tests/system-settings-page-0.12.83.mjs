// 0.12.83: runtime settings moved from Modules to System Configuration (/system/settings).
import assert from 'node:assert/strict'
import fs from 'node:fs'

globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {} }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const { coreNavigation } = await import('../src/core-navigation.js')

const entry = (context) => coreNavigation(context).find((item) => item.to === '/system/settings')
const shape = entry({ user: { superuser: true } })
assert.ok(shape, 'navigation entry exists')
assert.equal(shape.label, 'System Configuration')
assert.equal(shape.section, 'Administration')
assert.equal(shape.owner, 'core')

assert.equal(entry({ user: { superuser: true }, permissions: [] }).visible, true)
assert.equal(entry({ user: {}, permissions: ['core.privileged_operations'] }).visible, true)
assert.equal(entry({ user: {}, permissions: ['core.runtime_settings.manage'] }).visible, true)
assert.equal(entry({ user: {}, permissions: [] }).visible, false)
assert.equal(entry({ user: {}, permissions: ['core.view'] }).visible, false)
assert.equal(entry({ user: {}, permissions: [], capabilities: { manage_modules: true } }).visible, false, 'manage_modules alone is not enough')
assert.equal(entry({}).visible, false)

// All earlier core routes remain.
const routes = coreNavigation({ user: { superuser: true } }).map((item) => item.to)
for (const to of ['/dashboards', '/account', '/schedules', '/modules', '/access', '/resources', '/system/scheduler', '/system/updates', '/system/storage', '/system/backups', '/system/diagnostics', '/contracts']) {
  assert.ok(routes.includes(to), `${to} still in navigation`)
}

const router = read('../src/router.js')
assert.match(router, /path: '\/system\/settings', name: 'system-settings', component: SystemSettingsView, meta: \{ title: 'System Configuration' \}/)
for (const path of ['/system/scheduler', '/system/updates', '/system/storage', '/system/diagnostics', '/system/backups']) assert.ok(router.includes(`path: '${path}'`))

assert.doesNotMatch(read('../src/views/ModulesView.vue'), /RuntimeSettingsCard/)
const view = read('../src/views/SystemSettingsView.vue')
assert.match(view, /import RuntimeSettingsCard from '\.\.\/components\/RuntimeSettingsCard\.vue'/)
assert.match(view, /<RuntimeSettingsCard v-if="allowed" \/>/)
assert.match(view, /canEditRuntimeSettings\(state\?\.context\)/)
assert.doesNotMatch(view, /getRuntimeSettings/, 'the view itself never fetches')
assert.match(view, /<h1>System Configuration<\/h1>/)
assert.match(view, /state-inline denied/)
// The card is the only place that fetches, and it is only rendered when allowed.
assert.match(read('../src/components/RuntimeSettingsCard.vue'), /onMounted\(load\)/)

const articles = read('../src/help/core-articles.js')
assert.match(articles, /id: 'core\.system-settings'.*category: 'Core Administration'.*routes: \['\/system\/settings'\]/)
for (const keyword of ['runtime', 'time limit', 'start-up', 'settings']) assert.ok(articles.includes(`'${keyword}'`))
const help = read('../src/help/articles/system-settings.md')
assert.match(help, /core\.privileged_operations/)
assert.match(help, /core\.runtime_settings\.manage/)
assert.match(help, /5 to 300 seconds/)
assert.match(help, /next time the page loads/)
assert.match(read('../src/help/articles/modules.md'), /System Configuration/)
console.log('[TEST] PASS System Configuration page')
