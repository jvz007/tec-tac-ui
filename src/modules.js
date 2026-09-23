import { apiFetch } from './api'
export function listModules(){ return apiFetch('/api/tfd/modules/v2/') }
export function inspectModulePackages(files){
  const body=new FormData()
  let signature=null
  let metadata=null
  for(const file of files){
    const name=String(file?.name||'')
    if(/\.sig$/i.test(name)){ signature=file; continue }
    if(/\.release(?:\(\d+\))?\.json$/i.test(name)){ metadata=file; continue }
    body.append('packages',file)
  }
  if(signature) body.append('signature',signature)
  if(metadata) body.append('metadata',metadata)
  return apiFetch('/api/tfd/modules/v2/packages/inspect/',{method:'POST',body})
}
export function installModuleArtifact(uploadId,kind='artifact',order=[]){ return apiFetch(`/api/tfd/modules/v2/packages/${encodeURIComponent(uploadId)}/install/`,{method:'POST',body:JSON.stringify({kind,order})}) }
export function discardModuleArtifact(uploadId){ return apiFetch(`/api/tfd/modules/v2/packages/${encodeURIComponent(uploadId)}/`,{method:'DELETE'}) }
export function setModuleEnabled(moduleId,enabled,cascade=false){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/state/`,{method:'POST',body:JSON.stringify({enabled:!!enabled,cascade:!!cascade})}) }
export function setModuleVisible(moduleId,visible){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/visibility/`,{method:'POST',body:JSON.stringify({visible:!!visible})}) }
export function checkModuleRemoval(moduleId){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/remove-check/`) }
export function removeModule(moduleId){ return apiFetch(`/api/tfd/modules/${encodeURIComponent(moduleId)}/remove/`,{method:'POST',body:JSON.stringify({})}) }
export function listModuleJobs(limit=200){ return apiFetch(`/api/tfd/modules/v2/jobs/?limit=${encodeURIComponent(limit)}`) }
export function getModuleJob(jobId){ return apiFetch(`/api/tfd/modules/v2/jobs/${encodeURIComponent(jobId)}/`,{rejectErrorPayload:false}) }

export function listModuleRepositories(){ return apiFetch('/api/tfd/modules/repositories/') }
export function addModuleRepository(payload){ return apiFetch('/api/tfd/modules/repositories/',{method:'POST',body:JSON.stringify(payload)}) }
export function updateModuleRepository(repositoryId,payload){ return apiFetch(`/api/tfd/modules/repositories/${encodeURIComponent(repositoryId)}/`,{method:'PATCH',body:JSON.stringify(payload)}) }
export function deleteModuleRepository(repositoryId){ return apiFetch(`/api/tfd/modules/repositories/${encodeURIComponent(repositoryId)}/`,{method:'DELETE'}) }
export function syncModuleRepository(repositoryId){ return apiFetch(`/api/tfd/modules/repositories/${encodeURIComponent(repositoryId)}/sync/`,{method:'POST',body:JSON.stringify({})}) }
export function syncAllModuleRepositories(){ return apiFetch('/api/tfd/modules/repositories/sync/',{method:'POST',body:JSON.stringify({})}) }
export function listOnlineModuleCatalog(){ return apiFetch('/api/tfd/modules/catalog/online/') }
export function stageOnlineModulePackage(repositoryId,moduleId,version=null){ return apiFetch('/api/tfd/modules/catalog/online/stage/',{method:'POST',body:JSON.stringify({repository_id:repositoryId,module_id:moduleId,version})}) }

export function inspectModuleHotfix(file){ const body=new FormData(); body.append('hotfix',file); return apiFetch('/api/tfd/modules/hotfixes/inspect/',{method:'POST',body}) }
export function discardModuleHotfix(uploadId){ return apiFetch(`/api/tfd/modules/hotfixes/${encodeURIComponent(uploadId)}/`,{method:'DELETE'}) }
export function applyModuleHotfix(uploadId){ return apiFetch(`/api/tfd/modules/hotfixes/${encodeURIComponent(uploadId)}/apply/`,{method:'POST',body:JSON.stringify({})}) }
export function getModuleHotfixJob(jobId){ return apiFetch(`/api/tfd/modules/hotfixes/jobs/${encodeURIComponent(jobId)}/`,{rejectErrorPayload:false}) }
export function listModuleHotfixes(moduleId){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/hotfixes/`) }
export function rollbackModuleHotfix(moduleId,hotfixId){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/hotfixes/${encodeURIComponent(hotfixId)}/rollback/`,{method:'POST',body:JSON.stringify({})}) }
