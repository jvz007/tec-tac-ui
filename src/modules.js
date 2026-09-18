import { apiFetch } from './api'

export function listModules() {
  return apiFetch('/api/tfd/modules/')
}

export function inspectModulePackage(file) {
  const body = new FormData()
  body.append('package', file)
  return apiFetch('/api/tfd/modules/packages/inspect/', { method: 'POST', body })
}

export function discardModulePackage(uploadId) {
  return apiFetch(`/api/tfd/modules/packages/${encodeURIComponent(uploadId)}/`, { method: 'DELETE' })
}

export function installModulePackage(uploadId, replace = false) {
  return apiFetch(`/api/tfd/modules/packages/${encodeURIComponent(uploadId)}/install/`, {
    method: 'POST',
    body: JSON.stringify({ replace: !!replace }),
  })
}

export function removeModule(moduleId) {
  return apiFetch(`/api/tfd/modules/${encodeURIComponent(moduleId)}/remove/`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function getModuleJob(jobId) {
  return apiFetch(`/api/tfd/modules/jobs/${encodeURIComponent(jobId)}/`)
}
