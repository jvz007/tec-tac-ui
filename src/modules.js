import { apiFetch } from './api'
export function listModules(){ return apiFetch('/api/tfd/modules/v2/') }
// 0.12.95: every file goes to Core in one request as repeated fields. Core pairs each package with its .sig and
// .release.json from the release metadata. Core 1.17.20 or later.
export function inspectModulePackages(files){
  const body=new FormData()
  for(const file of files){
    const name=String(file?.name||'')
    if(/\.sig$/i.test(name)){ body.append('signatures',file); continue }
    if(/\.release(?:\(\d+\))?\.json$/i.test(name)){ body.append('metadata_files',file); continue }
    body.append('packages',file)
  }
  return apiFetch('/api/tfd/modules/v2/packages/inspect/',{method:'POST',body})
}
// 0.12.95: every set with no problem goes in ONE request (one batch from Core, or one staged package). A set with a
// problem is never sent. If the request fails, every sent set carries Core's message and nothing else is sent: there is
// no per-set retry. Returns one { set, staged } or { set, error } per set, in order. Sets that were sent share one staged payload.
export async function inspectIntakeSets(sets, post = inspectModulePackages){
  const list=Array.isArray(sets)?sets:[]
  const results=new Map()
  const sent=[]
  for(const set of list){
    if(set?.problems?.length) results.set(set,{set,error:set.problems[0]})
    else sent.push(set)
  }
  if(sent.length){
    const files=sent.flatMap((set)=>[set.pkg,set.sig,set.meta].filter(Boolean))
    try{
      const staged=await post(files)
      for(const set of sent) results.set(set,{set,staged})
    }catch(e){
      for(const set of sent) results.set(set,{set,error:e?.message||'Inspection failed.'})
    }
  }
  return list.map((set)=>results.get(set))
}
// disable_replaced is added only when it names modules, so an older Core and a plain install see the old body.
function withDisableReplaced(body,disableReplaced){
  const ids=Array.isArray(disableReplaced)?disableReplaced.filter((id)=>typeof id==='string'&&id):[]
  if(ids.length) body.disable_replaced=ids
  return body
}
export function installModuleArtifact(uploadId,kind='artifact',order=[],disableReplaced=[]){ return apiFetch(`/api/tfd/modules/v2/packages/${encodeURIComponent(uploadId)}/install/`,{method:'POST',body:JSON.stringify(withDisableReplaced({kind,order},disableReplaced))}) }
export function discardModuleArtifact(uploadId){ return apiFetch(`/api/tfd/modules/v2/packages/${encodeURIComponent(uploadId)}/`,{method:'DELETE'}) }
// confirm_replacement_switch (Core 1.17.12) is sent only when confirmSwitch is exactly true.
// confirm_without_hand_back (Core 1.17.14) is sent only when confirmWithoutHandBack is exactly true.
export function setModuleEnabled(moduleId,enabled,cascade=false,disableReplaced=[],confirmSwitch=false,confirmWithoutHandBack=false){
  const body=withDisableReplaced({enabled:!!enabled,cascade:!!cascade},disableReplaced)
  if(confirmSwitch===true) body.confirm_replacement_switch=true
  if(confirmWithoutHandBack===true) body.confirm_without_hand_back=true
  return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/state/`,{method:'POST',body:JSON.stringify(body)})
}
export function setModuleVisible(moduleId,visible){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/visibility/`,{method:'POST',body:JSON.stringify({visible:!!visible})}) }
export function checkModuleRemoval(moduleId){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/remove-check/`) }
// confirm_without_hand_back (Core 1.17.15) is sent only when confirmWithoutHandBack is exactly true.
export function removeModule(moduleId,confirmWithoutHandBack=false){
  const body=confirmWithoutHandBack===true?{confirm_without_hand_back:true}:{}
  return apiFetch(`/api/tfd/modules/${encodeURIComponent(moduleId)}/remove/`,{method:'POST',body:JSON.stringify(body)})
}
export function listModuleJobs({page=1,pageSize=50,status='',action='',search=''}={}){
  const query=new URLSearchParams({page:String(page),page_size:String(pageSize)})
  if(status) query.set('status',status)
  if(action) query.set('action',action)
  if(search) query.set('search',search)
  return apiFetch(`/api/tfd/modules/v2/jobs/?${query.toString()}`)
}
export function getModuleJob(jobId){ return apiFetch(`/api/tfd/modules/v2/jobs/${encodeURIComponent(jobId)}/`,{rejectErrorPayload:false}) }

export function listModuleRepositories(){ return apiFetch('/api/tfd/modules/repositories/') }
export function addModuleRepository(payload){ return apiFetch('/api/tfd/modules/repositories/',{method:'POST',body:JSON.stringify(payload)}) }
export function updateModuleRepository(repositoryId,payload){ return apiFetch(`/api/tfd/modules/repositories/${encodeURIComponent(repositoryId)}/`,{method:'PATCH',body:JSON.stringify(payload)}) }
export function deleteModuleRepository(repositoryId){ return apiFetch(`/api/tfd/modules/repositories/${encodeURIComponent(repositoryId)}/`,{method:'DELETE'}) }
export function syncModuleRepository(repositoryId){ return apiFetch(`/api/tfd/modules/repositories/${encodeURIComponent(repositoryId)}/sync/`,{method:'POST',body:JSON.stringify({})}) }
export function syncAllModuleRepositories(){ return apiFetch('/api/tfd/modules/repositories/sync/',{method:'POST',body:JSON.stringify({})}) }
export function listOnlineModuleCatalog(){ return apiFetch('/api/tfd/modules/catalog/online/') }
export function stageOnlineModulePackage(repositoryId,moduleId,version=null){ return apiFetch('/api/tfd/modules/catalog/online/stage/',{method:'POST',body:JSON.stringify({repository_id:repositoryId,module_id:moduleId,version})}) }

export function inspectModuleHotfix(files){
  const list=Array.isArray(files)?files:[files].filter(Boolean)
  const body=new FormData(); let hotfix=null,signature=null,metadata=null
  for(const file of list){
    const name=String(file?.name||'')
    if(/\.sig$/i.test(name)){if(signature) throw new Error('Select exactly one detached signature (.sig).');signature=file;continue}
    if(/\.release(?:\(\d+\))?\.json$/i.test(name)){if(metadata) throw new Error('Select exactly one release metadata file (.release.json).');metadata=file;continue}
    if(/\.zip$/i.test(name)){if(hotfix) throw new Error('Select exactly one hotfix ZIP.'); hotfix=file;continue}
  }
  if(!hotfix) throw new Error('Select a managed hotfix ZIP.')
  body.append('hotfix',hotfix)
  if(signature) body.append('signature',signature)
  if(metadata) body.append('metadata',metadata)
  return apiFetch('/api/tfd/modules/hotfixes/inspect/',{method:'POST',body})
}
export function discardModuleHotfix(uploadId){ return apiFetch(`/api/tfd/modules/hotfixes/${encodeURIComponent(uploadId)}/`,{method:'DELETE'}) }
export function applyModuleHotfix(uploadId){ return apiFetch(`/api/tfd/modules/hotfixes/${encodeURIComponent(uploadId)}/apply/`,{method:'POST',body:JSON.stringify({})}) }
export function getModuleHotfixJob(jobId){ return apiFetch(`/api/tfd/modules/hotfixes/jobs/${encodeURIComponent(jobId)}/`,{rejectErrorPayload:false}) }
export function listModuleHotfixes(moduleId){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/hotfixes/`) }
export function rollbackModuleHotfix(moduleId,hotfixId){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/hotfixes/${encodeURIComponent(hotfixId)}/rollback/`,{method:'POST',body:JSON.stringify({})}) }
