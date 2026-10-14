// Shared terminal widget (0.12.104). A module draws one terminal in its own window: xterm.js (MIT) draws the screen, so
// colours, cursor keys, full-screen programs and the scrollback behave as they do in Tactical's own terminal.
//
// All third-party code loads on the first create(), so the xterm code stays out of the main bundle. The file itself imports
// nothing from xterm, which lets it load in a test without a browser.
//
// createTerminalService() is shared. forModule(moduleId, { isAbandoned }) binds one copy to one module: its own id, at most
// TERMINAL_LIMITS.maxTerminalsPerModule terminals, and refusals after the module is abandoned or cleared. The module loader does
// the binding and calls clear() when the module is unloaded or fails, so every terminal the module made is disposed.
//
// Remote output is untrusted. It reaches xterm as data and is drawn as text only. OSC 8 links are inert (linkHandler does
// nothing, so no window.open or confirm is reached). There is no web-links, clipboard or webgl addon, no title handling and no
// window options, and allowProposedApi stays false, so remote output cannot copy to the clipboard or open anything.

import { copyTextToClipboard } from './clipboard.js'

export const TERMINAL_DEFAULTS = Object.freeze({
  fontSize: 14,
  scrollback: 50000,
  cursorBlink: true,
  convertEol: true,
  focus: true,
  rows: 24,
  cols: 80,
})

export const TERMINAL_LIMITS = Object.freeze({
  minFontSize: 8,
  maxFontSize: 32,
  maxScrollback: 50000,
  minDimension: 1,
  maxDimension: 1000,
  maxTerminalsPerModule: 8,
  resizeDebounceMs: 50,
  maxFontFamilyLength: 300,
  maxAriaLabelLength: 200,
})

const THEME_KEYS = Object.freeze([
  'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
])
// A #hex colour (3, 4, 6 or 8 digits) or an rgb(), rgba(), hsl() or hsla() colour made only of numbers, signs, dots,
// percent signs, deg, commas, slashes and spaces. Anything else is dropped before it reaches xterm.
const COLOUR_PATTERN = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?)\((?:[0-9.+-]{1,12}(?:%|deg)?[\s,/]{0,3}){3,4}\))$/i
const UNSAFE_FONT_PATTERN = /[;{}<>]|url\(/i
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/g
const CONTROL_CHECK = /[\u0000-\u001f\u007f]/

function plain(message) {
  return new Error(message)
}

function clampInt(value, min, max, fallback) {
  if (value === undefined || value === null) return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function boolOption(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

// Keeps only the colour names xterm knows and only values that pass COLOUR_PATTERN.
export function sanitizeTheme(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const key of THEME_KEYS) {
    const value = input[key]
    if (typeof value !== 'string') continue
    const text = value.trim()
    if (text.length <= 80 && COLOUR_PATTERN.test(text)) out[key] = text
  }
  return out
}

// Text up to 300 characters with no control characters and none of ; { } < > or url(. Anything else falls back.
export function sanitizeFontFamily(value, fallback) {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  if (!text || text.length > TERMINAL_LIMITS.maxFontFamilyLength) return fallback
  if (CONTROL_CHECK.test(text) || UNSAFE_FONT_PATTERN.test(text)) return fallback
  return text
}

function sanitizeLabel(value) {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_PATTERN, ' ').trim().slice(0, TERMINAL_LIMITS.maxAriaLabelLength)
}

function emptyElement(element) {
  try {
    while (element.firstChild) element.removeChild(element.firstChild)
  } catch {
    // An element that cannot be emptied is left as it is; xterm has already removed its own nodes.
  }
}

function hasSize(element) {
  return Number(element.clientWidth) > 0 && Number(element.clientHeight) > 0
}

function assertText(value, method) {
  if (typeof value !== 'string') throw plain(`terminal.${method}() takes text only.`)
}

function assertFunction(value, method) {
  if (typeof value !== 'function') throw plain(`terminal.${method}() needs a function.`)
}

function refuseAfterScope(moduleId, isAbandoned, cleared) {
  if (cleared) return `module ${moduleId} was unloaded; terminal.create() is refused`
  if (typeof isAbandoned === 'function' && isAbandoned() === true) {
    return `module ${moduleId} was abandoned after a failed or timed-out register(); terminal.create() is refused`
  }
  return ''
}

async function defaultLoadXterm() {
  // The stylesheet is loaded with the code, so the terminal has its own look from the first draw.
  const [xterm, fit] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/xterm/css/xterm.css'),
  ])
  return { Terminal: xterm.Terminal, FitAddon: fit.FitAddon }
}

export function createTerminalService({ loadXterm, ResizeObserverImpl, setTimer, clearTimer, copyText } = {}) {
  const loader = typeof loadXterm === 'function' ? loadXterm : defaultLoadXterm
  const observerClass = typeof ResizeObserverImpl === 'function' ? ResizeObserverImpl : globalThis.ResizeObserver
  const startTimer = typeof setTimer === 'function' ? setTimer : (fn, ms) => globalThis.setTimeout(fn, ms)
  const stopTimer = typeof clearTimer === 'function' ? clearTimer : (handle) => globalThis.clearTimeout(handle)
  const writeClipboard = typeof copyText === 'function' ? copyText : (text) => copyTextToClipboard(text)

  let parts = null
  function loadParts() {
    if (!parts) {
      parts = Promise.resolve().then(() => loader()).catch((error) => {
        parts = null
        throw error
      })
    }
    return parts
  }

  // The shell's colour tokens, read once from the document. Without a document (a test) the list is empty.
  let shell = null
  function shellTokens() {
    if (shell) return shell
    shell = {}
    try {
      const root = globalThis.document?.documentElement
      const style = root && typeof globalThis.getComputedStyle === 'function' ? globalThis.getComputedStyle(root) : null
      if (style) {
        shell = {
          background: style.getPropertyValue('--bg'),
          foreground: style.getPropertyValue('--ink'),
          cursor: style.getPropertyValue('--accent'),
          mono: style.getPropertyValue('--mono'),
        }
      }
    } catch {
      shell = {}
    }
    return shell
  }

  // A module's theme wins key by key; a key it leaves out takes the shell colour.
  function resolveTheme(input) {
    const tokens = shellTokens()
    return { ...sanitizeTheme({ background: tokens.background, foreground: tokens.foreground, cursor: tokens.cursor }), ...sanitizeTheme(input) }
  }

  function shellFontFamily() {
    return sanitizeFontFamily(shellTokens().mono, 'monospace')
  }

  function forModule(moduleId, { isAbandoned } = {}) {
    const live = new Set()
    let starting = 0
    let cleared = false

    function buildTerminal({ Terminal, FitAddon }, element, options) {
      const fontSize = clampInt(options.fontSize, TERMINAL_LIMITS.minFontSize, TERMINAL_LIMITS.maxFontSize, TERMINAL_DEFAULTS.fontSize)
      const scrollback = clampInt(options.scrollback, 0, TERMINAL_LIMITS.maxScrollback, TERMINAL_DEFAULTS.scrollback)
      const rows = clampInt(options.rows, TERMINAL_LIMITS.minDimension, TERMINAL_LIMITS.maxDimension, TERMINAL_DEFAULTS.rows)
      const cols = clampInt(options.cols, TERMINAL_LIMITS.minDimension, TERMINAL_LIMITS.maxDimension, TERMINAL_DEFAULTS.cols)
      const term = new Terminal({
        rows,
        cols,
        fontSize,
        fontFamily: sanitizeFontFamily(options.fontFamily, shellFontFamily()),
        cursorBlink: boolOption(options.cursorBlink, TERMINAL_DEFAULTS.cursorBlink),
        convertEol: boolOption(options.convertEol, TERMINAL_DEFAULTS.convertEol),
        scrollback,
        theme: resolveTheme(options.theme),
        allowProposedApi: false,
        // Clicking an OSC 8 link does nothing. xterm's default opens the link after a confirm(), which AD-27 does not allow here.
        linkHandler: { allowNonHttpProtocols: false, activate() {} },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)

      let disposed = false
      let pendingFit = null
      let lastSize = null
      let dataSubscription = null
      let observer = null
      const inputListeners = new Set()
      const resizeListeners = new Set()
      const onDispose = []

      if (typeof options.onInput === 'function') inputListeners.add(options.onInput)
      if (typeof options.onResize === 'function') resizeListeners.add(options.onResize)

      const label = sanitizeLabel(options.ariaLabel)
      term.open(element)
      if (label) element.setAttribute?.('aria-label', label)

      function currentSize() {
        return {
          rows: clampInt(term.rows, TERMINAL_LIMITS.minDimension, TERMINAL_LIMITS.maxDimension, TERMINAL_DEFAULTS.rows),
          cols: clampInt(term.cols, TERMINAL_LIMITS.minDimension, TERMINAL_LIMITS.maxDimension, TERMINAL_DEFAULTS.cols),
        }
      }

      // Calls onResize once after open, then only when rows or cols change.
      function syncSize() {
        if (disposed) return
        const next = currentSize()
        if (lastSize && lastSize.rows === next.rows && lastSize.cols === next.cols) return
        lastSize = next
        for (const listener of [...resizeListeners]) {
          try {
            listener({ rows: next.rows, cols: next.cols })
          } catch (error) {
            console.warn('[TEC-TAC-UI] A terminal resize listener failed.', error)
          }
        }
      }

      function fitNow() {
        if (disposed) return { rows: TERMINAL_DEFAULTS.rows, cols: TERMINAL_DEFAULTS.cols }
        // A hidden tab (zero width or height) keeps its last size.
        if (!hasSize(element)) return currentSize()
        try {
          fit.fit()
        } catch {
          // The addon is not ready yet; the next resize tries again.
        }
        syncSize()
        return currentSize()
      }

      function scheduleFit() {
        if (disposed) return
        if (pendingFit != null) stopTimer(pendingFit)
        pendingFit = startTimer(() => {
          pendingFit = null
          fitNow()
        }, TERMINAL_LIMITS.resizeDebounceMs)
      }

      function emitInput(data) {
        for (const listener of [...inputListeners]) {
          try {
            listener(data)
          } catch (error) {
            console.warn('[TEC-TAC-UI] A terminal input listener failed.', error)
          }
        }
      }

      function copySelection() {
        // The copy is the key's own work; a failed copy shows nothing here, and the module's Copy button shows its own notice.
        return handle.copy({ selectionOnly: true }).catch(() => {})
      }

      // Keys. Ctrl+C and every other key reach the shell as xterm sends them. Returning false leaves a key to the browser.
      term.attachCustomKeyEventHandler((event) => {
        const key = String(event?.key ?? '')
        const ctrl = event?.ctrlKey === true
        if (key === 'Insert' && ctrl) {
          if (event.type === 'keydown' && term.hasSelection()) copySelection()
          return false
        }
        // Shift+Insert and Ctrl+V: the browser's paste event reaches xterm once, and that is the only paste.
        if (key === 'Insert' && event?.shiftKey === true && !ctrl) return false
        if ((key === 'v' || key === 'V') && ctrl && event?.altKey !== true) return false
        return true
      })

      dataSubscription = term.onData((data) => emitInput(data))

      if (typeof observerClass === 'function') {
        observer = new observerClass(() => scheduleFit())
        observer.observe(element)
      }

      fitNow()
      syncSize()
      if (boolOption(options.focus, TERMINAL_DEFAULTS.focus)) term.focus()

      function dispose() {
        if (disposed) return
        disposed = true
        try { observer?.disconnect() } catch {}
        observer = null
        if (pendingFit != null) stopTimer(pendingFit)
        pendingFit = null
        inputListeners.clear()
        resizeListeners.clear()
        try { dataSubscription?.dispose() } catch {}
        dataSubscription = null
        try { term.dispose() } catch {}
        emptyElement(element)
        for (const fn of onDispose.splice(0)) {
          try { fn() } catch {}
        }
      }

      const handle = Object.freeze({
        write(text) {
          assertText(text, 'write')
          if (!disposed) term.write(text)
        },
        writeln(text) {
          assertText(text, 'writeln')
          if (!disposed) term.writeln(text)
        },
        clear() {
          if (!disposed) term.clear()
        },
        reset() {
          if (!disposed) term.reset()
        },
        focus() {
          if (!disposed) term.focus()
        },
        blur() {
          if (!disposed) term.blur()
        },
        fit() {
          return fitNow()
        },
        size() {
          return disposed ? { rows: TERMINAL_DEFAULTS.rows, cols: TERMINAL_DEFAULTS.cols } : currentSize()
        },
        getText() {
          if (disposed) return ''
          return bufferText(term)
        },
        getSelection() {
          return disposed ? '' : term.getSelection()
        },
        hasSelection() {
          return disposed ? false : term.hasSelection() === true
        },
        async copy(copyOptions = {}) {
          if (disposed) throw plain('This terminal is closed.')
          const selectionOnly = copyOptions?.selectionOnly === true
          const text = selectionOnly ? term.getSelection() : bufferText(term)
          await writeClipboard(text)
          return text
        },
        paste(text) {
          assertText(text, 'paste')
          if (!disposed) term.paste(text)
        },
        setTheme(theme) {
          if (!disposed) term.options.theme = resolveTheme(theme)
        },
        setOptions(next) {
          if (!next || typeof next !== 'object') throw plain('terminal.setOptions() takes an object.')
          if (disposed) return
          if ('fontSize' in next) term.options.fontSize = clampInt(next.fontSize, TERMINAL_LIMITS.minFontSize, TERMINAL_LIMITS.maxFontSize, TERMINAL_DEFAULTS.fontSize)
          if ('fontFamily' in next) term.options.fontFamily = sanitizeFontFamily(next.fontFamily, shellFontFamily())
          if ('cursorBlink' in next) term.options.cursorBlink = boolOption(next.cursorBlink, TERMINAL_DEFAULTS.cursorBlink)
          // A font change changes how many rows and columns fit, so fit again now.
          fitNow()
        },
        onInput(fn) {
          assertFunction(fn, 'onInput')
          inputListeners.add(fn)
          return () => { inputListeners.delete(fn) }
        },
        onResize(fn) {
          assertFunction(fn, 'onResize')
          resizeListeners.add(fn)
          return () => { resizeListeners.delete(fn) }
        },
        dispose,
      })
      onDispose.push(() => live.delete(handle))
      return handle
    }

    // Whole buffer, from the first scrollback line to the last. Wrapped lines are joined, trailing spaces are trimmed and
    // trailing empty lines are dropped.
    function bufferText(term) {
      const buffer = term.buffer.active
      const lines = []
      let current = null
      for (let row = 0; row < buffer.length; row += 1) {
        const line = buffer.getLine(row)
        if (!line) continue
        const text = line.translateToString(false)
        if (line.isWrapped && current !== null) {
          current += text
        } else {
          if (current !== null) lines.push(current)
          current = text
        }
      }
      if (current !== null) lines.push(current)
      const trimmed = lines.map((line) => line.replace(/\s+$/, ''))
      while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop()
      return trimmed.join('\n')
    }

    async function create(element, options = {}) {
      const refusal = refuseAfterScope(moduleId, isAbandoned, cleared)
      if (refusal) throw plain(refusal)
      if (!element || typeof element !== 'object' || typeof element.appendChild !== 'function') {
        throw plain('terminal.create() needs an element to draw the terminal in.')
      }
      if (live.size + starting >= TERMINAL_LIMITS.maxTerminalsPerModule) {
        throw plain(`This module already has ${TERMINAL_LIMITS.maxTerminalsPerModule} terminals open. Close one before you open another.`)
      }
      starting += 1
      let loaded
      try {
        loaded = await loadParts()
      } catch (error) {
        console.warn('[TEC-TAC-UI] The terminal code could not be loaded.', error)
        throw plain('The terminal could not be loaded. Try again.')
      } finally {
        starting -= 1
      }
      // The module may have been unloaded or abandoned while the code loaded.
      const late = refuseAfterScope(moduleId, isAbandoned, cleared)
      if (late) throw plain(late)
      const handle = buildTerminal(loaded, element, options && typeof options === 'object' ? options : {})
      live.add(handle)
      return handle
    }

    // Disposes every terminal this module made. The module's scope refuses any later create().
    function clear() {
      cleared = true
      for (const handle of [...live]) {
        try { handle.dispose() } catch {}
      }
      live.clear()
    }

    return { create, clear }
  }

  return { forModule }
}
