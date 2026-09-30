import { apiFetch } from './api'

export function listDashboards() {
  return apiFetch('/api/tfd/dashboards/')
}

export function getDashboard(id) {
  return apiFetch(`/api/tfd/dashboards/${encodeURIComponent(id)}/`)
}

export function createDashboard(payload) {
  return apiFetch('/api/tfd/dashboards/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateDashboard(id, payload) {
  return apiFetch(`/api/tfd/dashboards/${encodeURIComponent(id)}/`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteDashboard(id) {
  return apiFetch(`/api/tfd/dashboards/${encodeURIComponent(id)}/`, { method: 'DELETE' })
}
