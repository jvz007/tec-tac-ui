import { apiFetch } from './api'

export function listScheduledActions(){ return apiFetch('/api/tfd/scheduler/actions/') }
export function listSchedules(){ return apiFetch('/api/tfd/scheduler/schedules/') }
export function getSchedule(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`) }
export function createSchedule(payload){ return apiFetch('/api/tfd/scheduler/schedules/',{method:'POST',body:JSON.stringify(payload)}) }
export function updateSchedule(id,payload){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`,{method:'PATCH',body:JSON.stringify(payload)}) }
export function deleteSchedule(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`,{method:'DELETE'}) }
export function runScheduleNow(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/run/`,{method:'POST',body:JSON.stringify({})}) }
export function listScheduleRuns(scheduleId=null){ const q=scheduleId?`?schedule_id=${encodeURIComponent(scheduleId)}`:''; return apiFetch(`/api/tfd/scheduler/runs/${q}`) }
