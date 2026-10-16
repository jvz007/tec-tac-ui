// 0.12.115: the DataTable sort arrows are CSS escapes, not a control byte plus letters (review of 0.12.114, Medium).
// Also: no shipped source file under src/ holds a control byte other than tab, newline and carriage return, so the bug class
// cannot return. tests/ is not scanned: two older test files hold deliberate-looking 0x08 bytes, a separate question.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcDir = fileURLToPath(new URL('../src/', import.meta.url))
const BS = String.fromCharCode(92)
const css = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8')

// the exact rules, built without writing a backslash escape in this file's source
const up = `.tt-table th[aria-sort]::after{content:" ${BS}25B2";color:var(--accent-text)}`
const down = `.tt-table th[aria-sort="descending"]::after{content:" ${BS}25BC"}`
assert.ok(css.includes(up), 'the ascending arrow rule is the CSS escape 25B2')
assert.ok(css.includes(down), 'the descending arrow rule is the CSS escape 25BC')
assert.ok(css.indexOf(up) < css.indexOf(down), 'the descending rule comes after the ascending one, so it overrides it')
assert.equal(css.split(BS + '25B2').length - 1, 1, 'one ascending escape')
assert.equal(css.split(BS + '25BC').length - 1, 1, 'one descending escape')
assert.ok(!css.includes(String.fromCharCode(21) + 'B2') && !css.includes(String.fromCharCode(21) + 'BC'), 'the old control-byte junk is gone')

let scanned = 0
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(full); continue }
    if (!/\.(css|js|vue)$/.test(entry.name)) continue
    scanned += 1
    const buf = fs.readFileSync(full)
    for (let i = 0; i < buf.length; i += 1) {
      const b = buf[i]
      if (b <= 0x08 || (b >= 0x0b && b <= 0x1f && b !== 0x0d)) {
        assert.fail(`${path.relative(srcDir, full)} holds control byte 0x${b.toString(16)} at offset ${i}`)
      }
    }
  }
}
walk(srcDir)
assert.ok(scanned > 20, 'the scan found the source files')

console.log(`sort-arrows-0.12.115: scanned ${scanned} files`)
console.log('sort-arrows-0.12.115: PASS')
