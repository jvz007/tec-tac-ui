// 0.12.104: the terminal widget is written in the UI docs exactly. One note in the runtime API page (the contract row
// ui.authenticated.terminal, Core writes the export row), the full page module-terminal.md, the link from the WebSocket page,
// and tec_tac_package.json raised to Core 1.17.33. The doc cannot drift from the source: every handle member and every option
// default and limit in src/terminal-widget.js must appear in the doc.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { TERMINAL_DEFAULTS, TERMINAL_LIMITS } = await import(new URL('../src/terminal-widget.js', import.meta.url).href)
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const runtime = read('docs/module-runtime-api.md')
const full = read('docs/module-terminal.md')
const websocket = read('docs/module-tactical-websocket.md')

// 1. the runtime page: the section sits after the Tactical terminal socket and before hasTacticalPermission, with one note
const section = runtime.indexOf('## Terminal widget (terminal)')
const socket = runtime.indexOf('## Tactical terminal socket (tacticalWebSocket)')
const next = runtime.indexOf('## hasTacticalPermission(flag)')
assert.ok(section > socket && section < next, 'the terminal section sits after the socket section and before hasTacticalPermission')
const noteText = '**Contract row (UI 0.12.104, not yet in the export).** Browser contract row `ui.authenticated.terminal`'
assert.equal(runtime.split(noteText).length - 1, 1, 'exactly one note for the row')
const sectionText = runtime.slice(section, next)
const note = sectionText.slice(sectionText.indexOf(noteText))
assert.match(note, /phase `authenticated`, service `terminal`/)
for (const op of ['create', 'write', 'writeln', 'clear', 'reset', 'focus', 'blur', 'fit', 'size', 'getText', 'getSelection', 'hasSelection', 'copy', 'paste', 'setTheme', 'setOptions', 'onInput', 'onResize', 'dispose']) {
  assert.ok(note.includes(`\`${op}\``), `the note names operation ${op}`)
}
for (const option of ['theme', 'fontFamily', 'fontSize', 'cursorBlink', 'scrollback', 'convertEol', 'focus', 'rows', 'cols', 'ariaLabel', 'onInput', 'onResize']) {
  assert.ok(note.includes(`\`${option}\``), `the note names option ${option}`)
}
assert.match(note, /scrollback 50000/)
assert.match(note, /8 terminals per module/)
assert.match(note, /resize 1 to 1000/)
assert.match(note, /bound to the calling module/)
assert.match(note, /no `registerPublic` access/)
assert.match(note, /Core 1\.17\.33 or later and UI 0\.12\.104 or later/)
assert.match(note, /Core writes the export row/)
assert.match(note, /does not claim the export lists it/)
assert.match(note, /reviews\/requests\/core\.md/)

// 2. the full page names every handle member, as a call, in the same spelling as the source
const source = read('src/terminal-widget.js')
const handleStart = source.indexOf('const handle = Object.freeze({')
const handleEnd = source.indexOf('onDispose.push(() => live.delete(handle))')
assert.ok(handleStart > 0 && handleEnd > handleStart, 'the handle block is found in the source')
// a method is written `name(...) {`, or `name,` when it is a shorthand property (dispose)
const members = [...source.slice(handleStart, handleEnd).matchAll(/^ {8}(?:async )?([A-Za-z]+)(?:\(|,$)/gm)].map((match) => match[1])
assert.ok(members.length >= 18, `the source has the handle members (${members.length})`)
for (const member of members) assert.ok(full.includes(`${member}(`), `module-terminal.md names handle member ${member}`)

// 3. the option defaults in the doc equal the constants in the source
const defaultOf = (key) => {
  const line = full.split('\n').find((text) => text.startsWith(`| \`${key}\` |`))
  assert.ok(line, `the options table has ${key}`)
  return line.replace(/\|\s*$/, '').split('|').pop().trim()
}
for (const key of ['fontSize', 'scrollback', 'cursorBlink', 'convertEol', 'focus', 'rows', 'cols']) {
  assert.equal(defaultOf(key), String(TERMINAL_DEFAULTS[key]), `the default of ${key} is ${TERMINAL_DEFAULTS[key]}`)
}

// 4. the limits in the doc equal the constants in the source
assert.ok(full.includes(`whole number ${TERMINAL_LIMITS.minFontSize} to ${TERMINAL_LIMITS.maxFontSize}`), 'font size range')
assert.ok(full.includes(`whole number 0 to ${TERMINAL_LIMITS.maxScrollback}`), 'scrollback range')
assert.ok(full.includes(`Scrollback: ${TERMINAL_LIMITS.maxScrollback} lines`), 'scrollback limit')
assert.ok(full.includes(`${TERMINAL_LIMITS.maxTerminalsPerModule} live at once per module`), 'terminals per module')
assert.ok(full.includes(`${TERMINAL_LIMITS.minDimension} to ${TERMINAL_LIMITS.maxDimension} rows`), 'resize range')
assert.ok(full.includes(`about ${TERMINAL_LIMITS.resizeDebounceMs} ms`), 'resize debounce')
assert.ok(full.includes(`text up to ${TERMINAL_LIMITS.maxFontFamilyLength} characters`), 'font family limit')
assert.ok(full.includes(`${TERMINAL_LIMITS.maxAriaLabelLength} characters`), 'aria label limit')

// 5. the key, copy, safety and lifetime rules are written
for (const text of [
  'Ctrl+Insert copies the selection',
  'Ctrl+C always reaches the shell',
  'Shift+Insert and Ctrl+V paste through the browser',
  'Clicking it does nothing',
  'has no clipboard addon and no web-links addon',
  'Only the shell calls `clear()`',
  'This module already has 8 terminals open',
  'UI 0.12.104 or later',
  'registerPublic(context)` gets no terminal',
  '`THIRD-PARTY-NOTICES.md`',
  '/tec-tac/licenses/xterm-LICENSE.txt',
]) {
  assert.ok(full.includes(text), `module-terminal.md states: ${text}`)
}

// 6. the WebSocket page links to the widget; the framework requirement is raised to Core 1.17.33
assert.ok(websocket.includes('(module-terminal.md)'), 'module-tactical-websocket.md links to the widget')
assert.match(JSON.parse(read('tec_tac_package.json')).requires['tec-tac-framework'], /^>=1\.17\.\d+,<2\.0\.0$/)

console.log('terminal widget contract docs 0.12.104: PASS')
