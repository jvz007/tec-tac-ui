import assert from 'node:assert/strict'
import fs from 'node:fs'
function dataModule(path,replacements=[]){let source=fs.readFileSync(new URL(path,import.meta.url),'utf8');for(const[from,to]of replacements)source=source.replace(from,to);return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)}
const loader=await dataModule('../src/module-loader.js',[["import * as Vue from 'vue'",'const Vue = {}']])
const vueReactive='const reactive = (value) => value\n'
const vueHeader='const reactive = (value) => value\nconst markRaw = (value) => value\n'
const {createSsoProviderRegistry}=await dataModule('../src/sso-providers.js',[["import { reactive } from 'vue'",vueReactive]])
const {createHeaderContributionRegistry}=await dataModule('../src/header-contributions.js',[["import { markRaw, reactive } from 'vue'",vueHeader]])
const {createContextActionRegistry}=await dataModule('../src/context-actions.js',[["import { reactive } from 'vue'",vueReactive]])
const surface=await import('../src/extension-surface-workflows.js')
const router={currentRoute:{value:{path:'/',fullPath:'/'}},getRoutes:()=>[],addRoute:()=>()=>{},replace:async()=>{}}

const sso=createSsoProviderRegistry(); globalThis.__sso=false
const publicEntry=`data:text/javascript;base64,${Buffer.from(`export default { async registerPublic(ctx){ctx.ssoProviders.register({id:'globalsettings.entra',label:'Entra'},async()=>{globalThis.__sso=true;return 'started'})} }`).toString('base64')}`
let loaded=await loader.loadPublicUiModules({router,app:{},publicApi:async()=>{},ssoProviders:sso},[{id:'globalsettings',public:{entry:publicEntry,base_path:'/public/globalsettings'}}])
assert.deepEqual(loaded.failed,[]); assert.equal(await surface.beginLoginSso(sso,surface.loginSsoEntries(sso,{})[0],{return_to:'/tec-tac/'}),'started'); assert.equal(globalThis.__sso,true)

const state={context:{user:{username:'alice'}},contextSource:'backend'}
const base={state,router,addNavigation(){},api:async()=>{},apiRaw:async()=>{},apiBlob:async()=>{},apiText:async()=>{}}
const header=createHeaderContributionRegistry({hasPermission:()=>true})
const headerEntry=`data:text/javascript;base64,${Buffer.from(`export default { async register(ctx){ctx.header.register({id:'alerts.bell',label:'Alerts',component:{name:'AlertsBell'}})} }`).toString('base64')}`
loaded=await loader.loadUiModules({...base,header},[{id:'alerts',entry:headerEntry,permissions:[],allowed:true}])
assert.deepEqual(loaded.failed,[]); assert.deepEqual(surface.appHeaderItems(header,{user:state.context.user}).map(x=>x.id),['alerts.bell'])

const actions=createContextActionRegistry({hasPermission:()=>true}); globalThis.__ctx=null
const actionEntry=`data:text/javascript;base64,${Buffer.from(`export default { async register(ctx){ctx.contextActions.register({id:'halo.client',resource:'client',label:'Ticket',placements:['client.context-menu']},async c=>{globalThis.__ctx=c;return 42});ctx.contextActions.register({id:'halo.site',resource:'site',label:'Site',placements:['site.context-menu']},async()=>43)} }`).toString('base64')}`
loaded=await loader.loadUiModules({...base,contextActions:actions},[{id:'halo',entry:actionEntry,permissions:[],allowed:true}])
assert.deepEqual(loaded.failed,[])
const client={id:5,name:'Acme'}; const menu=surface.resourceContextMenuActions(actions,'client',client); assert.deepEqual(menu.map(x=>x.id),['halo.client']); assert.equal(await surface.executeResourceContextMenuAction(actions,menu[0],'client',client),42); assert.equal(globalThis.__ctx.client.id,5)
assert.deepEqual(surface.resourceContextMenuActions(actions,'site',{id:8}).map(x=>x.id),['halo.site'])

const login=fs.readFileSync(new URL('../src/components/LoginPanel.vue',import.meta.url),'utf8'); assert.match(login,/loginSsoEntries\(/); assert.match(login,/@click="beginSso\(entry\)"/)
const app=fs.readFileSync(new URL('../src/App.vue',import.meta.url),'utf8'); assert.match(app,/appHeaderItems\(/); assert.match(app,/module-header-contributions/)
const resources=fs.readFileSync(new URL('../src/views/ResourcesView.vue',import.meta.url),'utf8'); assert.match(resources,/resourceContextMenuActions\(contextActions, resourceType, row(?:,|\))/); assert.match(resources,/executeResourceContextMenuAction\(contextActions, action, resourceType, row(?:,|\))/)
console.log('F8/F9/F10 extension surfaces done-when 0.12.66: PASS')
