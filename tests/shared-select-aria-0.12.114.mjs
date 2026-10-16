// 0.12.114: SearchSelect required, invalid and describedBy (request from agents 0.11.3). The three props are off by default and
// change nothing when absent; set, they put aria-required, aria-invalid and aria-describedby on the role=combobox input.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { SearchSelect } = await import(new URL('../src/shared-components.js', import.meta.url).href)
const ssr = (props) => renderToString(createSSRApp({ render: () => h(SearchSelect, { options: [{ value: 1, label: 'One' }], ...props }) }))
const input = (html) => html.match(/<input[^>]*role="combobox"[^>]*>/)[0]

for (const name of ['required', 'invalid', 'describedBy']) {
  assert.ok(name in SearchSelect.props, `${name} is a prop`)
  assert.equal(SearchSelect.props[name].default === false || SearchSelect.props[name].default === undefined, true, `${name} is off by default`)
}

let tag = input(await ssr({}))
assert.ok(!tag.includes('aria-required') && !tag.includes('aria-invalid') && !tag.includes('aria-describedby'), 'nothing is added without the props')
tag = input(await ssr({ required: false, invalid: false, describedBy: '' }))
assert.ok(!tag.includes('aria-required') && !tag.includes('aria-invalid') && !tag.includes('aria-describedby'), 'false and empty add nothing')

tag = input(await ssr({ required: true }))
assert.ok(tag.includes('aria-required="true"') && !tag.includes('aria-invalid') && !tag.includes('aria-describedby'))
tag = input(await ssr({ invalid: true }))
assert.ok(tag.includes('aria-invalid="true"') && !tag.includes('aria-required'))
tag = input(await ssr({ describedBy: 'agent-error' }))
assert.ok(tag.includes('aria-describedby="agent-error"'))
tag = input(await ssr({ required: true, invalid: true, describedBy: 'x-hint x-error', ariaLabel: 'Agent', inputId: 'agent' }))
assert.ok(tag.includes('aria-required="true"') && tag.includes('aria-invalid="true"') && tag.includes('aria-describedby="x-hint x-error"') && tag.includes('aria-label="Agent"') && tag.includes('id="agent"'))

const css = read('../src/styles.css')
assert.ok(css.includes('.tt-input[aria-invalid="true"]{border-color:var(--danger)}'), 'the invalid state has its border')

const doc = read('../docs/module-components.md')
for (const prop of ['required', 'invalid', 'describedBy']) assert.ok(doc.includes(`\`${prop}\``), `module-components.md lists ${prop}`)
assert.ok(doc.includes('aria-required') && doc.includes('aria-invalid') && doc.includes('aria-describedby'))

console.log('shared-select-aria-0.12.114: PASS')
