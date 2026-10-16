// 0.12.114: size, density and radius tokens, the opt-in tt-ws work-surface scope and the 3px toast corners (UI Q57 to Q61).
// Everything is additive: the old tokens keep their values, the base rules are byte-identical to 0.12.113, and nothing outside
// .tt-ws changes. The scope is applied to the module dialog host panel and the kit only. No module defines it.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const css = read('../src/styles.css')

// (1) each token exists in :root with the board value
const tokenLine = css.split('\n').find((line) => line.startsWith(':root{--text-body:'))
assert.ok(tokenLine, 'the 0.12.114 token rule exists')
const want = {
  '--text-body': 'calc(15.5px * var(--font-scale))',
  '--text-ws': 'calc(12.1px * var(--font-scale))',
  '--text-sm': 'calc(11px * var(--font-scale))',
  '--text-xs': 'calc(10.5px * var(--font-scale))',
  '--cell-y': '7px',
  '--cell-x': '8px',
  '--ctl-y': '6px',
  '--ctl-x': '8px',
  '--radius-control': '2px',
  '--radius-panel': '3px',
  '--label-track-ws': '.08em',
}
for (const [name, value] of Object.entries(want)) assert.ok(tokenLine.includes(`${name}:${value}`), `${name} is ${value}`)

// (2) the old tokens keep their values (agents, remote-background, softwarerepository and tasks read them)
assert.ok(css.includes('--label:calc(10px * var(--font-scale));--label-track:.16em;--font-scale:1}'), '--label, --label-track and --font-scale are unchanged')

// (3) every font-size and font shorthand in the new rules goes through --font-scale (directly or by a token that does)
const scopeStart = css.indexOf('/* ==== Work-surface scope')
assert.ok(scopeStart > 0)
const kitEnd = css.indexOf("/* ==== end of the component kit ==== */")
assert.ok(kitEnd > scopeStart, "the kit block follows the scope block")
const newCss = `${tokenLine}
${css.slice(scopeStart, kitEnd)}`
const sizeOk = (v) => /--font-scale/.test(v) || /^var\(--(text-(ws|sm|xs|body)|label)\)/.test(v.trim()) || v.trim() === 'inherit'
let seen = 0
for (const m of newCss.matchAll(/(?:^|[;{])\s*font(?:-size)?:([^;}]*)/g)) {
  seen += 1
  assert.ok(sizeOk(m[1]), `font value scales: ${m[0].trim()}`)
}
assert.ok(seen >= 10, 'the new rules carry font sizes')
assert.ok(!/font(?:-size)?:\s*[\d.]+px/.test(newCss), 'no raw px font size in the new rules')

// (4) the .tt-ws rules
const scopeEnd = '/* ==== end of the work-surface scope ==== */'
const scope = css.slice(scopeStart, css.indexOf(scopeEnd))
assert.ok(scope.includes('.tt-ws{font-size:var(--text-ws)}'), 'text 12.1px scaled')
assert.ok(scope.includes('.tt-ws .tablewrap th,.tt-ws .tablewrap td{padding:var(--cell-y) var(--cell-x)}'), 'cells 7px 8px')
assert.ok(scope.includes('.tt-ws .tablewrap th{letter-spacing:var(--label-track-ws)}'), 'header tracking .08em')
assert.ok(scope.includes('.tt-ws .field>span{font:var(--label) var(--mono);letter-spacing:var(--label-track-ws)}'), 'labels 10px with .08em')
assert.ok(/\.tt-ws :is\(input,select,textarea\)[^{]*\{font-size:var\(--text-ws\);padding:var\(--ctl-y\) var\(--ctl-x\)\}/.test(scope), 'controls 12.1px, 6px 8px')
assert.ok(scope.includes('.tt-ws .btn{font-size:var(--text-ws);padding:5px 9px}'))
assert.ok(scope.includes('.tt-ws .btn.sm{font-size:var(--text-ws);padding:5px 9px}'))
assert.ok(!/\.tt-ws[^{]*\{[^}]*background/.test(scope), 'no .tt-ws rule changes a background: the filled .btn stays the secondary button (Q59 a)')

// (5) no .tt-ws selector outside the scope block, and the base rules are byte-identical to 0.12.113
const outside = css.slice(0, scopeStart)
assert.ok(!/\.tt-ws/.test(outside), 'no .tt-ws selector before the scope block')
const afterScope = css.slice(css.indexOf(scopeEnd) + scopeEnd.length)
assert.ok(!/\.tt-ws/.test(afterScope.replace(/\/\*[\s\S]*?\*\//g, '')), 'no .tt-ws selector after the scope block')
for (const rule of [
  '.field>span{display:block;margin-bottom:5px;font:calc(11.6px * var(--font-scale)) var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}',
  'tbody td{padding:9px 12px;border-bottom:1px solid var(--line-soft);vertical-align:middle}',
  'thead th{text-align:left;padding:8px 12px;font:var(--label) var(--mono);letter-spacing:var(--label-track);text-transform:uppercase;color:var(--dim);font-weight:400;border-bottom:1px solid var(--line);background:var(--thead-bg)}',
  '.btn{border:1px solid var(--line);background:var(--surface-2);color:var(--ink);padding:6px 10px;border-radius:2px;cursor:pointer}',
  '.btn.sm{padding:5px 8px;font-size:calc(11.6px * var(--font-scale))}',
  '.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}',
  '.field input{width:100%;border:1px solid var(--line);background:var(--input-bg);color:var(--ink);padding:9px 10px;border-radius:2px;outline:none}',
]) assert.ok(css.includes(rule), `unchanged base rule: ${rule.slice(0, 40)}`)

assert.ok(css.indexOf('.modal-backdrop.module-dialog-backdrop') > kitEnd, 'the new blocks sit before the 0.12.112 dialog host rules (module-dialogs-0.12.112 scans from there)')

// toast corners
assert.ok(/\.toast-card\{[^}]*border-radius:3px;/.test(css), '.toast-card radius is 3px')
assert.ok(!/\.toast-card\{[^}]*border-radius:10px/.test(css))
assert.ok(/\.toast-action\{[^}]*border-radius:2px;/.test(css), '.toast-action radius is 2px')
assert.ok(/\.toast-card\{[^}]*grid-template-columns:30px minmax\(0,1fr\) 28px;gap:10px;align-items:start;padding:12px;/.test(css), 'nothing else about the toast changed')

// (6) the module dialog host panel carries tt-ws, the routed page does not
const host = read('../src/components/ModuleDialogHost.vue')
assert.match(host, /class="modal-panel module-dialog-panel tt-ws"/, 'the module dialog panel carries tt-ws')
assert.ok(!/tt-ws/.test(read('../src/App.vue')), 'the shell does not add tt-ws to the routed page')
for (const f of fs.readdirSync(new URL('../src/views/', import.meta.url))) assert.ok(!/tt-ws/.test(read(`../src/views/${f}`)), `${f} does not use tt-ws`)

// (7) no module defines tt-ws or a kit class
const modulesDir = new URL('../../../modules/', import.meta.url)
if (!fs.existsSync(modulesDir)) {
  console.log('theme-tokens-0.12.114: modules/ absent, collision scan skipped')
} else {
  const names = ['tt-ws', 'tt-panel', 'tt-tablewrap', 'tt-table', 'tt-table-empty', 'tt-table-foot', 'tt-frow', 'tt-ctl', 'tt-win', 'tt-win-head', 'tt-win-title', 'tt-win-body', 'tt-win-foot', 'tt-win-actions', 'tt-props', 'tt-pane', 'tt-dirty', 'tt-status', 'tt-steps', 'tt-step', 'tt-sr', 'tt-iconbtn', 'tt-skel']
  const pattern = new RegExp(`\\.(${names.join('|')})(?![\\w-])`)
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full, out)
      } else if (/\.(js|mjs|css|vue|html)$/.test(entry.name)) out.push(full)
    }
    return out
  }
  let scanned = 0
  for (const mod of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!mod.isDirectory()) continue
    const ext = new URL(`${mod.name}/package/extensions/`, modulesDir)
    if (!fs.existsSync(ext)) continue
    for (const e of fs.readdirSync(ext, { withFileTypes: true })) {
      const ui = new URL(`${e.name}/ui/`, ext)
      if (!e.isDirectory() || !fs.existsSync(ui)) continue
      for (const file of walk(ui)) {
        scanned += 1
        const hit = fs.readFileSync(file, 'utf8').match(pattern)
        assert.ok(!hit, `${mod.name}: ${file.pathname.split('/').pop()} defines ${hit && hit[0]}, which the kit owns`)
      }
    }
  }
  console.log(`theme-tokens-0.12.114: scanned ${scanned} module UI files`)
}

console.log('theme-tokens-0.12.114: PASS')
