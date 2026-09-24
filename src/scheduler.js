import { apiFetch } from './api'

export function listScheduledActions(){ return apiFetch('/api/tfd/scheduler/actions/') }
export function listSchedules(ownerType=null){ const q=ownerType?`?owner_type=${encodeURIComponent(ownerType)}`:''; return apiFetch(`/api/tfd/scheduler/schedules/${q}`) }
export function getSchedule(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`) }
export function createSchedule(payload){ return apiFetch('/api/tfd/scheduler/schedules/',{method:'POST',body:JSON.stringify(payload)}) }
export function updateSchedule(id,payload){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`,{method:'PATCH',body:JSON.stringify(payload)}) }
export function deleteSchedule(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`,{method:'DELETE'}) }
export function runScheduleNow(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/run/`,{method:'POST',body:JSON.stringify({})}) }
export function listScheduleRuns(scheduleId=null,ownerType=null){ const params=new URLSearchParams(); if(scheduleId)params.set('schedule_id',scheduleId); if(ownerType)params.set('owner_type',ownerType); const q=params.toString()?`?${params.toString()}`:''; return apiFetch(`/api/tfd/scheduler/runs/${q}`) }

export function getSchedulerConfig(){ return apiFetch('/api/tfd/scheduler/config/') }
export function updateSchedulerConfig(payload){ return apiFetch('/api/tfd/scheduler/config/',{method:'PATCH',body:JSON.stringify(payload)}) }
export function getSchedulerHealth(){ return apiFetch('/api/tfd/scheduler/health/') }
export function runSchedulerSelfTest(mode){ return apiFetch('/api/tfd/scheduler/self-test/',{method:'POST',body:JSON.stringify({mode})}) }
