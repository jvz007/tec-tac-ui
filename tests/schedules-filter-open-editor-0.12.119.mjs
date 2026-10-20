// 0.12.119: a Created by filter that drops the open schedule from the list no longer turns the editor into "new schedule".
// The pure rules are tested directly; the page wiring (snapshot kept on open, cleared on save, delete, close, new and tab change,
// Save still choosing update by selectedId) is read from the source.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { keepsSelectedId, openScheduleRow } = await import(new URL('../src/schedule-open-editor.js', import.meta.url).href)
const view = read('../src/views/SchedulesView.vue')

const alice = { id: 7, name: 'Nightly', created_by_username: 'alice' }
const bob = { id: 8, name: 'Weekly', created_by_username: 'bob' }

// in the list: the list row wins (fresh data)
assert.equal(openScheduleRow([alice, bob], 7, { ...alice, name: 'old' }), alice)
// filtered out: the snapshot stands in, so the creator block still has a row
assert.equal(openScheduleRow([bob], 7, alice), alice)
assert.equal(keepsSelectedId([bob], 7, alice), true, 'the id is kept')
// no snapshot, or a snapshot of another schedule: nothing is kept
assert.equal(openScheduleRow([bob], 7, null), null)
assert.equal(openScheduleRow([bob], 7, bob), null)
assert.equal(keepsSelectedId([bob], 7, null), false)
assert.equal(keepsSelectedId([bob], 7, bob), false)
// a new schedule has no id
assert.equal(keepsSelectedId([bob], null, alice), false)
assert.equal(openScheduleRow([bob], null, alice), null)
assert.equal(keepsSelectedId(undefined, 7, alice), true)

// ---- wiring ----
assert.match(view, /import \{ keepsSelectedId, openScheduleRow \} from '\.\.\/schedule-open-editor'/)
assert.match(view, /const selected=computed\(\(\)=>openScheduleRow\(userSchedules\.value,selectedId\.value,openSnapshot\.value\)\)/)
assert.match(view, /if\(selectedId\.value&&!keepsSelectedId\(userSchedules\.value,selectedId\.value,openSnapshot\.value\)\)selectedId\.value=null;/, 'refresh keeps the open schedule')
assert.ok(!/editing\.value=false;await refresh\(\)/.test(view) || /closeEditor\(\);await refresh\(\)/.test(view))
// refresh never closes the editor
const refreshBody = view.slice(view.indexOf('async function refresh()'), view.indexOf('function changeRunPage'))
assert.ok(!refreshBody.includes('editing.value'), 'a refresh does not touch the editor')
// opening remembers the row
assert.match(view, /function edit\(item\)\{if\(item\.owner_type==='module'\)return;selectedId\.value=item\.id;openSnapshot\.value=item;/)
// the snapshot is cleared on save, delete, close, new and tab change
assert.match(view, /function closeEditor\(\)\{editing\.value=false;openSnapshot\.value=null\}/)
assert.match(view, /else await createSchedule\(data\);closeEditor\(\);await refresh\(\)/, 'save')
assert.match(view, /selectedId\.value=null;closeEditor\(\);notice\.value=force/, 'delete')
assert.match(view, /aria-label="Close schedule editor" @click="closeEditor"/, 'close')
assert.match(view, /<button class="btn" @click="closeEditor">Cancel<\/button>/, 'cancel')
assert.match(view, /function createNew\(\)\{draft\.value=blank\(\);editing\.value=true;openSnapshot\.value=null;selectedId\.value=null;/, 'new')
assert.match(view, /editing\.value=false;openSnapshot\.value=null;selectedId\.value=null;if\(value/, 'tab change')
assert.ok(!/@click="editing=false"/.test(view), 'no close path leaves a snapshot behind')
// Save: update when an id is held, create only for a new schedule
assert.match(view, /if\(selectedId\.value\)await updateSchedule\(selectedId\.value,data\);else await createSchedule\(data\)/)
// the creator block shows from `selected`
assert.match(view, /<dl v-if="selected" class="kvlist"><dt>Created by<\/dt><dd>\{\{createdByDisplay\(selected\)\}\}<\/dd><dt>Confirmed by<\/dt>/)
// a refresh does not rebuild the draft, so what was typed stays
assert.ok(!refreshBody.includes('draft.value'), 'a refresh does not touch the draft')
console.log('schedules-filter-open-editor-0.12.119: ok')
