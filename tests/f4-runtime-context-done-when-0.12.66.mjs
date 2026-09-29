import assert from 'node:assert/strict'
import fs from 'node:fs'

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from,to] of replacements) source = source.replace(from,to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const { normalizeBackendRuntimeContext } = await import('../src/runtime-context.js')
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
const tactical_ui = {agent_dblclick_action:'urlaction', url_action_id:77, can_run_url_actions:true}
const normalized = normalizeBackendRuntimeContext({user:{username:'alice'}, tactical_ui}, {username:'fallback'})
assert.deepEqual(normalized.tactical_ui, tactical_ui)
let captured = null
globalThis.__f4_capture = value => { captured = value }
const entry = `data:text/javascript;base64,${Buffer.from(`export default { async register(ctx) { globalThis.__f4_capture(ctx.context.tactical_ui) } }`).toString('base64')}`
const router={currentRoute:{value:{path:'/',fullPath:'/'}},getRoutes:()=>[],addRoute:()=>()=>{},replace:async()=>{}}
const loaded = await loader.loadUiModules({state:{context:normalized,contextSource:'backend'},router,addNavigation(){},api:async()=>{},apiRaw:async()=>{},apiBlob:async()=>{},apiText:async()=>{}},[{id:'probe',entry,permissions:[],allowed:true}])
assert.deepEqual(loaded.failed, [])
assert.deepEqual(captured, tactical_ui)
console.log('F4 module-readable Tactical UI context done-when 0.12.66: PASS')
