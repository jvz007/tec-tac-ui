import assert from 'node:assert/strict'
import { changePasswordWorkflow, resetTotpWorkflow, revokeOthersWorkflow, saveTacticalUiWorkflow } from '../src/my-account-workflows.js'
import { loadRelocationSites, deleteResourceWorkflow, editableCustomFieldRows, saveCustomFieldsWorkflow } from '../src/resource-feature-workflows.js'
import { loginSsoEntries, beginLoginSso, appHeaderItems, resourceContextMenuActions, executeResourceContextMenuAction } from '../src/extension-surface-workflows.js'

// F1-F4: actual My Account workflow functions used by MyAccountView.
let calls=[]
let result=await changePasswordWorkflow({current:'old',next:'new',confirm:'new'},{changeMyPassword:async(a,b)=>{calls.push(['password',a,b]);return{other_sessions_revoked:3}}})
assert.equal(result.message,'Password changed. 3 other session(s) signed out.')
await assert.rejects(()=>changePasswordWorkflow({current:'old',next:'a',confirm:'b'},{changeMyPassword:async()=>{}}),/do not match/)
let cleared=0,reloaded=0
result=await resetTotpWorkflow({password:'old',code:' 123456 '},{resetMyTotp:async(a,b)=>calls.push(['totp',a,b]),confirmReset:()=>true,clearSession:()=>cleared++,reload:()=>reloaded++})
assert.equal(result.reset,true); assert.equal(cleared,1); assert.equal(reloaded,1); assert.deepEqual(calls.at(-1),['totp','old','123456'])
result=await revokeOthersWorkflow({revokeMyOtherSessions:async()=>({revoked:4}),confirmRevoke:()=>true}); assert.equal(result.message,'4 other session(s) signed out.')
result=await saveTacticalUiWorkflow({agent_dblclick_action:'urlaction',url_action_id:7},{saveMyTacticalUiPreferences:async payload=>({preferences:payload})})
assert.deepEqual(result.preferences,{agent_dblclick_action:'urlaction',url_action_id:7})

// F5-F7: actual ResourcesView workflow functions.
const pages={1:{items:[{id:1,client_id:10},{id:2,client_id:20}],pages:2},2:{items:[{id:3,client_id:30}],pages:2}}
let siteCalls=[]
const sites=await loadRelocationSites({listResourceSites:async q=>{siteCalls.push(q);return pages[q.page]},excludeClientId:20,pageSize:100})
assert.deepEqual(sites.map(x=>x.id),[1,3]); assert.deepEqual(siteCalls.map(x=>x.page),[1,2])
result=await deleteResourceWorkflow({type:'client',row:{id:20},destination_site_id:'3'},{deleteResourceClient:async(id,opt)=>({moved_agents:id===20&&opt.moveToSiteId===3?2:0}),deleteResourceSite:async()=>{throw new Error('wrong')}})
assert.equal(result.deletedClientId,20); assert.match(result.message,/2 agents moved/)
const rows=editableCustomFieldRows({fields:[{field_id:1,value:['a','b']}]}); rows[0].value.push('c'); assert.deepEqual(rows[0].value,['a','b','c'])
let savedFields=null
result=await saveCustomFieldsWorkflow({resourceType:'site',row:{id:9},fields:[{field_id:2,value:true}]},{updateResourceCustomFields:async(type,id,values)=>{savedFields={type,id,values}}})
assert.deepEqual(savedFields,{type:'site',id:9,values:[{field_id:2,value:true}]}); assert.match(result.message,/Site custom fields updated/)

// F8: production login consumer functions operate on the provider contract.
let ssoCtx=null
const sso={
  list:()=>[{id:'global-settings.entra',label:'Entra'}],
  begin:async(id,ctx)=>{assert.equal(id,'global-settings.entra');ssoCtx=ctx;return'ok'},
}
assert.equal(loginSsoEntries(sso,{}).length,1); assert.equal(await beginLoginSso(sso,loginSsoEntries(sso,{})[0],{return_to:'/tec-tac/'}),'ok'); assert.equal(ssoCtx.return_to,'/tec-tac/')

// F9: production App consumer respects the header registry's already-filtered list.
const header={list:()=>[{id:'alerts.bell',label:'Alerts',component:{name:'Bell'}}]}
assert.deepEqual(appHeaderItems(header,{user:{}}).map(x=>x.id),['alerts.bell'])

// F10: production Resources consumer discovers and executes context-menu actions.
let actionCtx=null
const actions={
  list:({resource,placement,context})=>{assert.equal(resource,'client');assert.equal(placement,'client.context-menu');assert.equal(context.client.id,5);return[{id:'halo.client',label:'Ticket',state:{enabled:true}}]},
  execute:async(id,ctx)=>{assert.equal(id,'halo.client');actionCtx=ctx;return 42},
}
const client={id:5,name:'Acme'}; const menu=resourceContextMenuActions(actions,'client',client); assert.deepEqual(menu.map(x=>x.id),['halo.client']); assert.equal(await executeResourceContextMenuAction(actions,menu[0],'client',client),42); assert.equal(actionCtx.client.id,5)

console.log('feature closure F1-F10 0.12.63: PASS')
