// 0.12.105: the server-terminal kind is written in the UI docs: the kind, the {} body, the path, the three frames, no start,
// the close codes 4502 and 4003, both 403 ticket refusals, Core 1.17.34 and UI 0.12.105.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const full = read('../docs/module-tactical-websocket.md')
const runtime = read('../docs/module-runtime-api.md')
const terminal = read('../docs/module-terminal.md')

for (const [name, doc] of [['websocket page', full], ['runtime page', runtime]]) {
  for (const needle of ['server-terminal', '/ws/tfd/server-terminal/<ticket>/', 'trmmcli.input', 'trmmcli.resize', 'trmmcli.disconnect', '4502', '4003', 'superuser_required', 'server_terminal_disabled', 'Core 1.17.34', 'UI 0.12.105']) {
    assert.ok(doc.includes(needle), `${name} names ${needle}`)
  }
  assert.match(doc, /`agent-terminal` is unchanged/)
}
assert.match(full, /exactly `\{\}`/)
assert.match(full, /no start frame/i)
assert.match(full, /`session\.start\(\)` throws/)
assert.match(full, /audit-unavailable/)
assert.match(full, /own id may open this kind/)
assert.match(full, /AD-20 replaced-module exception does not apply/)
assert.match(full, />=1\.17\.34,<2\.0\.0/)
assert.match(runtime, /ui\.authenticated\.websocket/)
assert.equal(runtime.split('`ui.authenticated.websocket`').length - 1, 1, 'one note per row in the runtime page')
assert.match(runtime, /does not claim the export lists it/)
assert.match(terminal, /server-terminal/)
assert.match(terminal, /no start step/)
assert.match(terminal, /do not call `session\.start\(\)`/)
assert.equal(JSON.parse(read('../tec_tac_package.json')).requires['tec-tac-framework'], '>=1.17.38,<2.0.0')
console.log('tactical websocket server terminal docs 0.12.105: PASS')
