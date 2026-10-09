import { apiFetch } from './api'
export function listModules(){ return apiFetch('/api/tfd/modules/v2/') }
export function inspectModulePackages(files){
  const body=new FormData()
  let signature=null
  let metadata=null
  for(const file of files){
    const name=String(file?.name||'')
    if(/\.sig$/i.test(name)){ if(signature) throw new Error('Select exactly one detached signature (.sig).'); signature=file; continue }
    if(/\.release(?:\(\d+\))?\.json$/i.test(name)){ if(metadata) throw new Error('Select exactly one release metadata file (.release.json).'); metadata=file; continue }
    body.append('packages',file)
  }
  if(signature) body.append('signature',signature)
  if(metadata) body.append('metadata',metadata)
  return apiFetch('/api/tfd/modules/v2/packages/inspect/',{method:'POST',body})
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
export function setModuleEnabled(moduleId,enabled,cascade=false,disableReplaced=[],confirmSwitch=false){
  const body=withDisableReplaced({enabled:!!enabled,cascade:!!cascade},disableReplaced)
  if(confirmSwitch===true) body.confirm_replacement_switch=true
  return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/state/`,{method:'POST',body:JSON.stringify(body)})
}
export function setModuleVisible(moduleId,visible){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/visibility/`,{method:'POST',body:JSON.stringify({visible:!!visible})}) }
export function checkModuleRemoval(moduleId){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/remove-check/`) }
export function removeModule(moduleId){ return apiFetch(`/api/tfd/modules/${encodeURIComponent(moduleId)}/remove/`,{method:'POST',body:JSON.stringify({})}) }
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
