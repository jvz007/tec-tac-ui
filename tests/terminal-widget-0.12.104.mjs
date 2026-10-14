// 0.12.104: the shared terminal widget. xterm.js is replaced by fakes injected through loadXterm, so this runs in Node.
// It checks the defaults and limits, the sanitised theme and font, the once-after-open resize rule, the hidden-tab rule,
// getText over wrapped lines, the key rules (Ctrl+Insert copies and is swallowed, Ctrl+C and Shift+Insert are passed on,
// Ctrl+V leaves the paste to the browser), the inert links, the refusals and the per-module lifetime.
import assert from 'node:assert/strict'

const { createTerminalService, sanitizeFontFamily, sanitizeTheme, TERMINAL_DEFAULTS, TERMINAL_LIMITS } = await import(new URL('../src/terminal-widget.js', import.meta.url).href)

class FakeTerminal {
  static instances = []
  constructor(options) {
    this.options = { ...options }
    this.rows = options.rows
    this.cols = options.cols
    this.opened = null
    this.written = []
    this.pasted = []
    this.focused = 0
    this.blurred = 0
    this.disposed = false
    this.selection = ''
    this.dataListeners = []
    this.keyHandler = null
    this.addons = []
    this.buffer = { active: { length: 0, lines: [], getLine: (row) => this.buffer.active.lines[row] } }
    FakeTerminal.instances.push(this)
  }
  loadAddon(addon) { this.addons.push(addon); addon.attach(this) }
  open(element) { this.opened = element }
  write(text) { this.written.push(text) }
  writeln(text) { this.written.push(`${text}\r\n`) }
  clear() {}
  reset() {}
  focus() { this.focused += 1 }
  blur() { this.blurred += 1 }
  paste(text) { this.pasted.push(text) }
  getSelection() { return this.selection }
  hasSelection() { return this.selection.length > 0 }
  attachCustomKeyEventHandler(fn) { this.keyHandler = fn }
  onData(fn) {
    this.dataListeners.push(fn)
    return { dispose: () => { this.dataListeners = this.dataListeners.filter((listener) => listener !== fn) } }
  }
  dispose() { this.disposed = true }
  emitData(data) { for (const fn of this.dataListeners) fn(data) }
}

// Fit like the real addon in spirit: 16 pixels a row, 8 pixels a column, clamped by the caller's own limits.
class FakeFitAddon {
  static instances = []
  constructor() { this.fits = 0; this.term = null; FakeFitAddon.instances.push(this) }
  attach(term) { this.term = term }
  fit() {
    this.fits += 1
    const el = this.term.opened
    this.term.rows = Math.floor(el.clientHeight / 16)
    this.term.cols = Math.floor(el.clientWidth / 8)
  }
}

class FakeObserver {
  static instances = []
  constructor(callback) { this.callback = callback; this.observed = null; this.disconnected = false; FakeObserver.instances.push(this) }
  observe(element) { this.observed = element }
  disconnect() { this.disconnected = true }
  fire() { this.callback([]) }
}

function fakeTimers() {
  let nextId = 1
  let pending = []
  return {
    setTimer(fn, ms) { const id = nextId; nextId += 1; pending.push({ id, fn, ms }); return id },
    clearTimer(id) { pending = pending.filter((timer) => timer.id !== id) },
    run() { const now = pending; pending = []; for (const timer of now) timer.fn() },
    count() { return pending.length },
  }
}

function fakeElement(width, height) {
  return {
    clientWidth: width,
    clientHeight: height,
    attrs: {},
    children: [],
    get firstChild() { return this.children[0] ?? null },
    setAttribute(name, value) { this.attrs[name] = value },
    appendChild(child) { this.children.push(child) },
    removeChild(child) { this.children = this.children.filter((node) => node !== child) },
  }
}

function service(overrides = {}) {
  const timers = fakeTimers()
  const copied = []
  const svc = createTerminalService({
    loadXterm: async () => ({ Terminal: FakeTerminal, FitAddon: FakeFitAddon }),
    ResizeObserverImpl: FakeObserver,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    copyText: async (text) => { copied.push(text); return true },
    ...overrides,
  })
  return { svc, timers, copied }
}

const lastTerm = () => FakeTerminal.instances[FakeTerminal.instances.length - 1]
const lastFit = () => FakeFitAddon.instances[FakeFitAddon.instances.length - 1]
const lastObserver = () => FakeObserver.instances[FakeObserver.instances.length - 1]

// 1. defaults, with a zero-size element: nothing fits, focus is taken, onResize fires once with the start size
{
  const { svc } = service()
  const seen = []
  const scope = svc.forModule('demo', { isAbandoned: () => false })
  const handle = await scope.create(fakeElement(0, 0), { onResize: (size) => seen.push(size) })
  const term = lastTerm()
  assert.equal(term.options.scrollback, 50000)
  assert.equal(term.options.cursorBlink, true)
  assert.equal(term.options.convertEol, true)
  assert.equal(term.options.fontSize, 14)
  assert.equal(term.options.allowProposedApi, false)
  assert.equal(term.options.fontFamily, 'monospace', 'no shell font outside a document falls back to monospace')
  assert.equal(term.focused, 1, 'focus is taken on open')
  assert.equal(lastFit().fits, 0, 'a zero-size element is not fitted')
  assert.deepEqual(seen, [{ rows: 24, cols: 80 }], 'onResize fires once after open with the start size')
  assert.deepEqual(handle.size(), { rows: 24, cols: 80 })
  assert.equal(TERMINAL_DEFAULTS.scrollback, 50000)
  assert.equal(TERMINAL_DEFAULTS.fontSize, 14)
}

// 2. focus can be turned off; cursorBlink and convertEol can be turned off too
{
  const { svc } = service()
  await svc.forModule('demo').create(fakeElement(0, 0), { focus: false, cursorBlink: false, convertEol: false })
  assert.equal(lastTerm().focused, 0)
  assert.equal(lastTerm().options.cursorBlink, false)
  assert.equal(lastTerm().options.convertEol, false)
}

// 3. clamps: scrollback above 50 000 is 50 000, below 0 is 0; fontSize clamps to 8 to 32; a bad number is the default
{
  const { svc } = service()
  const scope = svc.forModule('demo')
  await scope.create(fakeElement(0, 0), { scrollback: 999999, fontSize: 99 })
  assert.equal(lastTerm().options.scrollback, 50000)
  assert.equal(lastTerm().options.fontSize, 32)
  await scope.create(fakeElement(0, 0), { scrollback: -5, fontSize: 2 })
  assert.equal(lastTerm().options.scrollback, 0)
  assert.equal(lastTerm().options.fontSize, 8)
  await scope.create(fakeElement(0, 0), { fontSize: 'big', scrollback: Number.NaN })
  assert.equal(lastTerm().options.fontSize, 14)
  assert.equal(lastTerm().options.scrollback, 50000)
}

// 4. theme: values that are not a colour are dropped; the good ones pass; a key left out takes the shell colour
{
  assert.deepEqual(sanitizeTheme({
    background: '#101010',
    foreground: 'url(x)',
    cursor: 'red; background:url(x)',
    red: 'rgb(255,0,0)',
    green: 'expression(1)',
    brightBlue: 'hsl(210 50% 50%)',
    cursorAccent: 'rgba(0,0,0,.5)',
    selectionBackground: 'hsla(120deg, 50%, 50%, 0.4)',
    notAColour: '#fff',
    yellow: '#abcdef80',
  }), {
    background: '#101010',
    red: 'rgb(255,0,0)',
    brightBlue: 'hsl(210 50% 50%)',
    cursorAccent: 'rgba(0,0,0,.5)',
    selectionBackground: 'hsla(120deg, 50%, 50%, 0.4)',
    yellow: '#abcdef80',
  })
  assert.deepEqual(sanitizeTheme('not an object'), {})
  const { svc } = service()
  await svc.forModule('demo').create(fakeElement(0, 0), { theme: { background: '#101010', foreground: 'url(x)' } })
  assert.equal(lastTerm().options.theme.background, '#101010')
  assert.equal(lastTerm().options.theme.foreground, undefined, 'a bad value is never passed on')
}

// 5. font family: text up to 300 characters with no control characters, ; { } < > or url(; anything else falls back
{
  assert.equal(sanitizeFontFamily('Fira Code, monospace', 'x'), 'Fira Code, monospace')
  assert.equal(sanitizeFontFamily('a;b', 'x'), 'x')
  assert.equal(sanitizeFontFamily('a{b}', 'x'), 'x')
  assert.equal(sanitizeFontFamily('<b>', 'x'), 'x')
  assert.equal(sanitizeFontFamily('url(evil)', 'x'), 'x')
  assert.equal(sanitizeFontFamily('URL(evil)', 'x'), 'x')
  assert.equal(sanitizeFontFamily('mono\u0007', 'x'), 'x')
  assert.equal(sanitizeFontFamily('a'.repeat(TERMINAL_LIMITS.maxFontFamilyLength + 1), 'x'), 'x')
  assert.equal(sanitizeFontFamily('a'.repeat(TERMINAL_LIMITS.maxFontFamilyLength), 'x').length, 300)
  assert.equal(sanitizeFontFamily(42, 'x'), 'x')
  const { svc } = service()
  await svc.forModule('demo').create(fakeElement(0, 0), { fontFamily: 'url(evil)' })
  assert.equal(lastTerm().options.fontFamily, 'monospace')
}

// 6. onResize fires once after open, then only when rows or cols change, never with 0, and always clamped to 1 to 1000
{
  const { svc, timers } = service()
  const seen = []
  const element = fakeElement(800, 480)
  await svc.forModule('demo').create(element, { onResize: (size) => seen.push(size) })
  assert.deepEqual(seen, [{ rows: 30, cols: 100 }], 'the first fit is reported once')
  lastObserver().fire()
  timers.run()
  assert.equal(seen.length, 1, 'a fit that changes nothing does not fire')
  element.clientWidth = 1600
  lastObserver().fire()
  timers.run()
  assert.deepEqual(seen.at(-1), { rows: 30, cols: 200 })
  element.clientHeight = 10
  lastObserver().fire()
  timers.run()
  assert.deepEqual(seen.at(-1), { rows: 1, cols: 200 }, 'a row count below one is clamped to one, never zero')
  element.clientHeight = 100000
  element.clientWidth = 100000
  lastObserver().fire()
  timers.run()
  assert.deepEqual(seen.at(-1), { rows: 1000, cols: 1000 }, 'the upper clamp is 1000')
  assert.ok(seen.every((size) => size.rows >= 1 && size.cols >= 1 && size.rows <= 1000 && size.cols <= 1000))
}

// 7. a hidden tab (zero width or height) does not fit and keeps its last size; resize is debounced
{
  const { svc, timers } = service()
  const element = fakeElement(800, 480)
  const handle = await svc.forModule('demo').create(element)
  const fitsAfterOpen = lastFit().fits
  element.clientWidth = 0
  lastObserver().fire()
  timers.run()
  assert.equal(lastFit().fits, fitsAfterOpen, 'a zero-width element is not fitted')
  assert.deepEqual(handle.size(), { rows: 30, cols: 100 }, 'the last size is kept')
  element.clientWidth = 800
  lastObserver().fire()
  lastObserver().fire()
  assert.equal(timers.count(), 1, 'two observer calls in a row leave one pending fit')
  timers.run()
  assert.equal(lastFit().fits, fitsAfterOpen + 1)
}

// 8. getText: wrapped lines are joined, trailing spaces trimmed, trailing empty lines dropped
{
  const { svc } = service()
  const handle = await svc.forModule('demo').create(fakeElement(0, 0))
  const rows = [
    ['first line   ', false],
    ['wrap part one ', false],
    ['continued   ', true],
    ['', false],
    ['last   ', false],
    ['', false],
    ['', false],
  ]
  lastTerm().buffer.active.length = rows.length
  lastTerm().buffer.active.lines = rows.map(([text, wrapped]) => ({
    isWrapped: wrapped,
    translateToString: (trim) => (trim ? text.replace(/\s+$/, '') : text),
  }))
  assert.equal(handle.getText(), 'first line\nwrap part one continued\n\nlast')
}

// 9. onInput gets typed data and the escape sequences unchanged; a remover stops the calls
{
  const { svc } = service()
  const got = []
  const handle = await svc.forModule('demo').create(fakeElement(0, 0), { onInput: (data) => got.push(data) })
  const term = lastTerm()
  term.emitData('ls\r')
  term.emitData('\x1b[A')
  term.emitData('\x1b[1;5D')
  term.emitData('\x1b[1;5C')
  term.emitData('\x03')
  assert.deepEqual(got, ['ls\r', '\x1b[A', '\x1b[1;5D', '\x1b[1;5C', '\x03'])
  let extra = 0
  const remove = handle.onInput(() => { extra += 1 })
  term.emitData('x')
  remove()
  term.emitData('y')
  assert.equal(extra, 1)
  assert.throws(() => handle.onInput('not a function'), /needs a function/)
}

// 10. keys: Ctrl+Insert copies the selection and is swallowed; Ctrl+C and Shift+Insert pass on; Ctrl+V is left to the paste event
{
  const { svc, copied } = service()
  const handle = await svc.forModule('demo').create(fakeElement(0, 0))
  const term = lastTerm()
  const key = (event) => term.keyHandler({ type: 'keydown', key: '', ctrlKey: false, shiftKey: false, altKey: false, ...event })
  term.selection = 'picked text'
  assert.equal(key({ key: 'Insert', ctrlKey: true }), false, 'Ctrl+Insert is swallowed')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(copied, ['picked text'], 'Ctrl+Insert copies the selection')
  term.selection = ''
  assert.equal(key({ key: 'Insert', ctrlKey: true }), false)
  assert.deepEqual(copied, ['picked text'], 'Ctrl+Insert with no selection copies nothing')
  assert.equal(key({ key: 'c', ctrlKey: true }), true, 'Ctrl+C reaches the shell')
  assert.equal(key({ key: 'Insert', shiftKey: true }), false, 'Shift+Insert is left to the browser paste event')
  assert.equal(key({ key: 'v', ctrlKey: true }), false, 'Ctrl+V is left to the browser paste event')
  assert.equal(key({ key: 'V', ctrlKey: true }), false)
  assert.equal(key({ key: 'v', ctrlKey: true, altKey: true }), true, 'AltGr+V is a character, not a paste')
  assert.equal(key({ key: 'ArrowUp' }), true)
  assert.equal(key({ key: 'Home' }), true)
  assert.equal(key({ key: 'Insert', ctrlKey: true, type: 'keyup' }), false, 'Ctrl+Insert is swallowed on keyup too')
  assert.deepEqual(copied, ['picked text'], 'keyup never copies')
  assert.equal(handle.hasSelection(), false)
}

// 11. OSC 8 links are inert: the link handler never opens a window and never asks with confirm()
{
  const calls = []
  globalThis.window = { open: () => { calls.push('open') } }
  globalThis.confirm = () => { calls.push('confirm'); return true }
  try {
    const { svc } = service()
    await svc.forModule('demo').create(fakeElement(0, 0))
    const linkHandler = lastTerm().options.linkHandler
    assert.equal(linkHandler.allowNonHttpProtocols, false)
    assert.equal(linkHandler.activate({}, 'https://example.test'), undefined)
    assert.deepEqual(calls, [], 'nothing opens and nothing asks')
  } finally {
    delete globalThis.window
    delete globalThis.confirm
  }
}

// 12. write and paste take text only; a non-string throws a plain error; write draws the text
{
  const { svc } = service()
  const handle = await svc.forModule('demo').create(fakeElement(0, 0))
  handle.write('hello\r\n')
  handle.writeln('world')
  assert.deepEqual(lastTerm().written, ['hello\r\n', 'world\r\n'])
  assert.throws(() => handle.write(5), /takes text only/)
  assert.throws(() => handle.writeln({}), /takes text only/)
  assert.throws(() => handle.paste(null), /takes text only/)
  handle.paste('pasted')
  assert.deepEqual(lastTerm().pasted, ['pasted'])
}

// 13. copy: the selection or the whole buffer goes through the clipboard helper; with no clipboard the helper's message comes back
{
  const { svc, copied } = service()
  const handle = await svc.forModule('demo').create(fakeElement(0, 0))
  lastTerm().selection = 'sel'
  assert.equal(await handle.copy({ selectionOnly: true }), 'sel')
  lastTerm().buffer.active.length = 1
  lastTerm().buffer.active.lines = [{ isWrapped: false, translateToString: () => 'whole' }]
  assert.equal(await handle.copy(), 'whole')
  assert.deepEqual(copied, ['sel', 'whole'])
  assert.equal(handle.getSelection(), 'sel')
  assert.equal(handle.hasSelection(), true)
}

{
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
  try {
    const { svc } = service({ copyText: undefined })
    const handle = await svc.forModule('demo').create(fakeElement(0, 0))
    await assert.rejects(() => handle.copy(), /Clipboard access is unavailable in this browser\./)
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete globalThis.navigator
  }
}

// 14. setOptions and setTheme: values are clamped or dropped, and a font change fits again
{
  const { svc } = service()
  const handle = await svc.forModule('demo').create(fakeElement(800, 480))
  const fits = lastFit().fits
  handle.setOptions({ fontSize: 40, fontFamily: 'bad;font', cursorBlink: false })
  assert.equal(lastTerm().options.fontSize, 32)
  assert.equal(lastTerm().options.fontFamily, 'monospace')
  assert.equal(lastTerm().options.cursorBlink, false)
  assert.equal(lastFit().fits, fits + 1, 'a font change fits again')
  handle.setTheme({ background: 'url(x)', cursor: '#0f0' })
  assert.equal(lastTerm().options.theme.cursor, '#0f0')
  assert.equal(lastTerm().options.theme.background, undefined)
  assert.throws(() => handle.setOptions(null), /takes an object/)
}

// 15. a document's shell tokens colour the terminal when no theme is given, and the font falls back to --mono
{
  globalThis.document = { documentElement: {} }
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (name) => ({ '--bg': ' #141517', '--ink': '#f1f3f5', '--accent': '#4dabf7', '--mono': 'ui-monospace, Menlo, monospace' })[name] || '',
  })
  try {
    const { svc } = service()
    await svc.forModule('demo').create(fakeElement(0, 0))
    assert.equal(lastTerm().options.theme.background, '#141517')
    assert.equal(lastTerm().options.theme.foreground, '#f1f3f5')
    assert.equal(lastTerm().options.theme.cursor, '#4dabf7')
    assert.equal(lastTerm().options.fontFamily, 'ui-monospace, Menlo, monospace')
  } finally {
    delete globalThis.document
    delete globalThis.getComputedStyle
  }
}

// 16. dispose: idempotent, disconnects the observer, drops the xterm instance and empties the element; closed handles are quiet
{
  const { svc, timers } = service()
  const element = fakeElement(800, 480)
  const handle = await svc.forModule('demo').create(element)
  handle.dispose()
  handle.dispose()
  assert.equal(lastObserver().disconnected, true)
  assert.equal(lastTerm().disposed, true)
  assert.equal(element.children.length, 0)
  assert.equal(timers.count(), 0)
  handle.write('late frame')
  assert.deepEqual(lastTerm().written, [])
  assert.deepEqual(handle.size(), { rows: 24, cols: 80 })
  assert.equal(handle.getText(), '')
  await assert.rejects(() => handle.copy(), /This terminal is closed/)
}

// 17. a module may have at most 8 live terminals; the ninth create() rejects with a plain message
{
  const { svc } = service()
  const scope = svc.forModule('busy')
  const handles = []
  for (let i = 0; i < TERMINAL_LIMITS.maxTerminalsPerModule; i += 1) handles.push(await scope.create(fakeElement(0, 0)))
  await assert.rejects(() => scope.create(fakeElement(0, 0)), /already has 8 terminals open/)
  handles[0].dispose()
  await scope.create(fakeElement(0, 0))
  assert.equal(handles.length, 8)
}

// 18. clear() disposes only that module's terminals and refuses later creates; an abandoned module is refused
{
  const { svc } = service()
  const a = svc.forModule('a')
  const b = svc.forModule('b')
  const termA = await a.create(fakeElement(0, 0))
  await a.create(fakeElement(0, 0))
  const termB = await b.create(fakeElement(0, 0))
  const [aTerm1, aTerm2] = FakeTerminal.instances.slice(-3, -1)
  const bTerm = lastTerm()
  a.clear()
  assert.equal(aTerm1.disposed, true)
  assert.equal(aTerm2.disposed, true)
  assert.equal(bTerm.disposed, false, "another module's terminal survives")
  assert.equal(termA.size().rows, 24, 'a disposed handle answers with defaults')
  await assert.rejects(() => a.create(fakeElement(0, 0)), /was unloaded; terminal\.create\(\) is refused/)
  termB.write('still here')
  assert.deepEqual(bTerm.written, ['still here'])

  let abandoned = false
  const c = svc.forModule('c', { isAbandoned: () => abandoned })
  await c.create(fakeElement(0, 0))
  abandoned = true
  await assert.rejects(() => c.create(fakeElement(0, 0)), /was abandoned after a failed or timed-out register\(\); terminal\.create\(\) is refused/)
}

// 19. the default loader is not called until a create() needs it, and a create() with no element is refused
{
  let loads = 0
  const svc = createTerminalService({
    loadXterm: async () => { loads += 1; return { Terminal: FakeTerminal, FitAddon: FakeFitAddon } },
    ResizeObserverImpl: FakeObserver,
  })
  const scope = svc.forModule('lazy')
  assert.equal(loads, 0, 'nothing loads when the service is made or a module is bound')
  await assert.rejects(() => scope.create(null), /needs an element/)
  assert.equal(loads, 0, 'a refused create does not load the code')
  await scope.create(fakeElement(0, 0))
  assert.equal(loads, 1)
}

// 20. a failed load is reported plainly and the next create tries again
{
  let attempts = 0
  const svc = createTerminalService({
    loadXterm: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('network down')
      return { Terminal: FakeTerminal, FitAddon: FakeFitAddon }
    },
    ResizeObserverImpl: FakeObserver,
  })
  const scope = svc.forModule('retry')
  await assert.rejects(() => scope.create(fakeElement(0, 0)), /The terminal could not be loaded\. Try again\./)
  await scope.create(fakeElement(0, 0))
  assert.equal(attempts, 2)
}

// 21. ariaLabel is set on the element with control characters removed
{
  const { svc } = service()
  const element = fakeElement(0, 0)
  await svc.forModule('demo').create(element, { ariaLabel: 'Host\u0007 shell' })
  assert.equal(element.attrs['aria-label'], 'Host  shell')
}

console.log('terminal widget 0.12.104: PASS')
