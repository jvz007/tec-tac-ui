import fs from 'node:fs'
import assert from 'node:assert/strict'

const runtime = fs.readFileSync(new URL('../src/runtime-context.js', import.meta.url), 'utf8')
const schedules = fs.readFileSync(new URL('../src/views/SchedulesView.vue', import.meta.url), 'utf8')
const docs = fs.readFileSync(new URL('../docs/module-runtime-api.md', import.meta.url), 'utf8')
for (const key of ['locale', 'timeZone', 'dateTimeFormat']) assert.match(runtime, new RegExp(key))
assert.match(schedules, /state\.context\?\.timeZone \|\| browserTz/)
assert.match(docs, /context\.context\.timeZone/)
console.log('networkprobe runtime-context 0.12.71: PASS')
