import { apiFetch } from './api'
export function listModules(){ return apiFetch('/api/tfd/modules/v2/') }
export function inspectModulePackages(files){ const body=new FormData(); for(const file of files) body.append('packages',file); return apiFetch('/api/tfd/modules/v2/packages/inspect/',{method:'POST',body}) }
export function installModuleArtifact(uploadId,kind='artifact'){ return apiFetch(`/api/tfd/modules/v2/packages/${encodeURIComponent(uploadId)}/install/`,{method:'POST',body:JSON.stringify({kind})}) }
export function setModuleEnabled(moduleId,enabled,cascade=false){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/state/`,{method:'POST',body:JSON.stringify({enabled:!!enabled,cascade:!!cascade})}) }
export function checkModuleRemoval(moduleId){ return apiFetch(`/api/tfd/modules/v2/${encodeURIComponent(moduleId)}/remove-check/`) }
export function removeModule(moduleId){ return apiFetch(`/api/tfd/modules/${encodeURIComponent(moduleId)}/remove/`,{method:'POST',body:JSON.stringify({})}) }
export function getModuleJob(jobId){ return apiFetch(`/api/tfd/modules/v2/jobs/${encodeURIComponent(jobId)}/`) }
