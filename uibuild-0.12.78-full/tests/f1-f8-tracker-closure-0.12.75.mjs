import assert from 'node:assert/strict'
import fs from 'node:fs'

const store = new Map()
globalThis.localStorage = { getItem:k=>store.get(k) ?? null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) }
globalThis.document = { cookie: 'csrftoken=csrf-closure' }
globalThis.CustomEvent = class CustomEvent { constructor(type, init={}) { this.type=type; this.detail=init.detail } }
globalThis.window = { _env_:{PROD_URL:'https://rmm.example.test'}, location:{origin:'https://rmm.example.test', href:'https://rmm.example.test/tec-tac/'}, dispatchEvent(){} }

store.set('access_token','existing-token')
const calls=[]
globalThis.fetch = async (url, options={}) => {
  const path = new URL(url).pathname
  calls.push({path,options})
  if (path === '/api/tfd/account/password/') return new Response(JSON.stringify({detail:'This password is too common.'}), {status:400,headers:{'content-type':'application/json'}})
  if (path === '/accounts/ssoproviders/token/') return new Response(JSON.stringify({token:'sso-token',username:'alice',provider:'entra'}), {status:200,headers:{'content-type':'application/json'}})
  if (path === '/accounts/users/') return new Response('[]',{status:200,headers:{'content-type':'application/json'}})
  if (path === '/api/tfd/ui/context/') return new Response(JSON.stringify({user:{username:'alice'},permissions:[]}),{status:200,headers:{'content-type':'application/json'}})
  throw new Error(`unexpected ${path}`)
}

const account = await import('../src/account.js')
const workflows = await import('../src/my-account-workflows.js')
const { passwordFailureMessage } = await import('../src/my-account-password.js')
let caught
try { await workflows.changePasswordWorkflow({current:'old',next:'password',confirm:'password'},{changeMyPassword:account.changeMyPassword}) } catch (e) { caught=e }
assert.equal(caught.status,400)
assert.equal(passwordFailureMessage(caught),'This password is too common.')
const view = fs.readFileSync(new URL('../src/views/MyAccountView.vue', import.meta.url),'utf8')
assert.match(view,/passwordError\.value = passwordFailureMessage\(err\)/)
assert.match(view,/v-if="passwordError"[^>]*role="alert"[^>]*>\{\{ passwordError \}\}/)
assert.match(view,/@click="changePassword"/)
localStorage.removeItem('access_token')

function dataModule(path,replacements=[]){let source=fs.readFileSync(new URL(path,import.meta.url),'utf8');for(const[from,to]of replacements)source=source.replace(from,to);return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)}
const { createSsoProviderRegistry } = await dataModule('../src/sso-providers.js', [["import { reactive } from 'vue'", 'const reactive = (value) => value']])
const { beginLoginSso } = await import('../src/extension-surface-workflows.js')
const registry=createSsoProviderRegistry()
let publicContext
registry.forModule('globalsettings').register({id:'globalsettings.entra',label:'Microsoft Entra ID',begin:ctx=>{publicContext={...ctx}; return {redirect:'/accounts/ssoproviders/entra/'}}})
await beginLoginSso(registry,{id:'globalsettings.entra'},{return_to:'https://rmm.example.test/tec-tac/',location:{href:'https://rmm.example.test/tec-tac/'}})
assert.equal('token' in publicContext,false)
assert.equal('access_token' in publicContext,false)
assert.equal(localStorage.getItem('access_token'),null)
const api=await import('../src/api.js')
const result=await api.completeTacticalSso()
assert.equal(result.authenticated,true)
assert.equal(localStorage.getItem('access_token'),'sso-token')
assert.deepEqual(calls.slice(-3).map(x=>x.path),['/accounts/ssoproviders/token/','/accounts/users/','/api/tfd/ui/context/'])
const callback=fs.readFileSync(new URL('../src/views/SsoCallbackView.vue', import.meta.url),'utf8')
assert.match(callback,/completeTacticalSso\(\)/)
const loader=fs.readFileSync(new URL('../src/module-loader.js', import.meta.url),'utf8')
assert.match(loader,/registerPublic\(\{[\s\S]*ssoProviders: moduleSsoProviders/)
assert.doesNotMatch(loader,/registerPublic\(\{[\s\S]{0,500}(?:access_token|token):/)
console.log('F1/F8 tracker closure 0.12.75: PASS')
