import assert from 'node:assert/strict'

globalThis.window = { _env_: { PROD_URL: 'https://api.example.test' }, location: { origin: 'https://ui.example.test' }, dispatchEvent(){} }
globalThis.localStorage = { getItem: key => key === 'access_token' ? 'token' : null, setItem(){}, removeItem(){} }
const calls=[]
globalThis.fetch = async (url, options={}) => {
  calls.push({url, options})
  return {
    ok:true, status:200, statusText:'OK', headers:{get:()=> 'application/json'},
    async json(){ return { moved_agents: 2, fields: [{field_id:1,name:'Code',type:'text',options:[],required:false,value:'A'}] } },
    async text(){ return '' }, clone(){ return this },
  }
}
const api = await import('../src/api.js')
await api.deleteResourceClient(7,{moveToSiteId:22})
await api.deleteResourceSite(9,{moveToSiteId:10})
await api.getResourceCustomFields('client',7)
await api.getResourceCustomFields('site',9)
await api.updateResourceCustomFields('client',7,[{field_id:1,value:'B'}])
await api.updateResourceCustomFields('site',9,[{field_id:2,value:true}])

assert.deepEqual(calls.map(c=>new URL(c.url).pathname),[
  '/api/tfd/resources/clients/7/',
  '/api/tfd/resources/sites/9/',
  '/api/tfd/resources/clients/7/custom-fields/',
  '/api/tfd/resources/sites/9/custom-fields/',
  '/api/tfd/resources/clients/7/custom-fields/',
  '/api/tfd/resources/sites/9/custom-fields/',
])
assert.equal(calls[0].options.method,'DELETE')
assert.deepEqual(JSON.parse(calls[0].options.body),{move_to_site_id:22})
assert.equal(calls[1].options.method,'DELETE')
assert.deepEqual(JSON.parse(calls[1].options.body),{move_to_site_id:10})
assert.equal(calls[4].options.method,'PATCH')
assert.deepEqual(JSON.parse(calls[4].options.body),{values:[{field_id:1,value:'B'}]})
assert.equal(calls[5].options.method,'PATCH')
assert.deepEqual(JSON.parse(calls[5].options.body),{values:[{field_id:2,value:true}]})
console.log('resource features UI 0.12.61: PASS')
