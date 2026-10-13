// 0.12.102: the browser contract row ui.authenticated.websocket is written exactly in the UI docs. One note in the runtime API
// page, in the Tactical terminal socket section, and the full page in module-tactical-websocket.md. The row names the service,
// the operations, the events, the three close codes, the ticket route, the 30 second single-use rule and the versions. The page
// says the export does not list it yet.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const runtime = fs.readFileSync(new URL('../docs/module-runtime-api.md', import.meta.url), 'utf8')
const full = fs.readFileSync(new URL('../docs/module-tactical-websocket.md', import.meta.url), 'utf8')
const at = (doc, needle, from = 0) => {
  const index = doc.indexOf(needle, from)
  assert.ok(index >= 0, `${needle} is in the document`)
  return index
}

// the runtime page: the section, its one note, and the note sits between its heading and the next section
const section = at(runtime, '## Tactical terminal socket (tacticalWebSocket)')
const next = at(runtime, '## hasTacticalPermission(flag)', section)
const note = at(runtime, '**Contract row (UI 0.12.102, not yet in the export).** Browser contract row `ui.authenticated.websocket`', section)
assert.ok(note > section && note < next, 'the row note sits in the terminal socket section')
const sectionText = runtime.slice(section, next)
assert.equal(runtime.split('`ui.authenticated.websocket`').length - 1, 1, 'one note per row in the runtime page')
assert.match(sectionText, /phase `authenticated`, service `tacticalWebSocket`/)
for (const op of ['open', 'session.start', 'session.input', 'session.resize', 'session.kill', 'session.close', 'session.on']) {
  assert.ok(sectionText.includes(`\`${op}\``), `operation ${op} is named`)
}
for (const event of ['output', 'error', 'info', 'close']) assert.ok(sectionText.includes(`\`${event}\``), `event ${event} is named`)
assert.match(sectionText, /4401 \(`signin-ended`\)/)
assert.match(sectionText, /4003 \(`not-allowed`\)/)
assert.match(sectionText, /4503 \(`unavailable`\)/)
assert.match(sectionText, /`POST \/api\/tfd\/tactical-websocket\/<module_id>\/<kind>\/tickets\/` with exactly `\{agent_id\}`/)
assert.match(sectionText, /a ticket lives 30 seconds and works once/)
assert.match(sectionText, /a new one is asked for each terminal tab/)
assert.match(sectionText, /Core 1\.17\.31 or later and UI 0\.12\.102 or later/)
assert.match(sectionText, /does not claim the export lists it/)
assert.match(sectionText, /module-tactical-websocket\.md/)
assert.match(sectionText, /own id, or the core module it replaces under AD-20/)

// the full page: the row in its contract section, the three close codes and their messages, the refusals, the rules
const contract = at(full, '## Contract row (`ui.authenticated.websocket`)')
const contractText = full.slice(contract)
assert.match(contractText, /id `ui\.authenticated\.websocket`, phase `authenticated`, service `tacticalWebSocket`/)
assert.match(contractText, /the close codes 4401, 4003 and 4503/)
assert.match(contractText, /the ticket route/)
assert.match(contractText, /lives 30 seconds, works once/)
assert.match(contractText, /Core 1\.17\.31 or later, and UI 0\.12\.102 or later/)
assert.match(contractText, /`reviews\/requests\/core\.md`/)
for (const message of [
  'Your terminal session ended. Open the terminal again.',
  'You are not allowed to use the terminal on this endpoint.',
  "Tactical's terminal is not available right now. Try again later.",
  'The terminal connection closed unexpectedly.',
  "Tactical's terminal did not answer. Try again.",
  'Too many terminal requests. Wait a minute and try again.',
  'The terminal is not available right now. Try again later.',
  'This module cannot open that terminal.',
]) {
  assert.ok(full.includes(message), `plain message present: ${message}`)
}
assert.match(full, /A ticket lives 30 seconds and works once/)
assert.match(full, /asks for a fresh ticket on every open/)
assert.match(full, /never reuses one and never retries/)
assert.match(full, /tec-tac-framework >=1\.17\.31,<2\.0\.0/)
assert.match(full, /The ticket never appears in an error message, a console line or a stored value/)

// the sections of the full page come before the contract row, so a reader meets the rules first
assert.ok(at(full, '## Ticket refusals') < contract)
assert.ok(at(full, '## Lifetime') < contract)

console.log('tactical websocket contract docs 0.12.102: PASS')
