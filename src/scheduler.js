import { apiFetch } from './api'
import { schedulesQuery } from './scheduler-creators.js'

export function listScheduledActions(){ return apiFetch('/api/tfd/scheduler/actions/') }
// 0.12.118: the optional second argument filters by creator and confirmer (Core 1.17.63). One argument sends what it always sent.
export function listSchedules(ownerType=null,{createdBy='',confirmedBy=''}={}){ const q=schedulesQuery(ownerType,{createdBy,confirmedBy}); return apiFetch(`/api/tfd/scheduler/schedules/${q}`) }
export function getSchedule(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`) }
export function createSchedule(payload){ return apiFetch('/api/tfd/scheduler/schedules/',{method:'POST',body:JSON.stringify(payload)}) }
export function updateSchedule(id,payload){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`,{method:'PATCH',body:JSON.stringify(payload)}) }
export function deleteSchedule(id,{force=false}={}){ const q=force?'?force=true':''; return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/${q}`,{method:'DELETE'}) }
export function runScheduleNow(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/run/`,{method:'POST',body:JSON.stringify({})}) }
export function listScheduleRuns({scheduleId=null,ownerType=null,page=null,pageSize=null,search='',status=''}={}){ const params=new URLSearchParams(); if(scheduleId)params.set('schedule_id',scheduleId); if(ownerType)params.set('owner_type',ownerType); if(page)params.set('page',String(page)); if(pageSize)params.set('page_size',String(pageSize)); if(search)params.set('search',search); if(status)params.set('status',status); const q=params.toString()?`?${params.toString()}`:''; return apiFetch(`/api/tfd/scheduler/runs/${q}`) }

export function getSchedulerConfig(){ return apiFetch('/api/tfd/scheduler/config/') }
export function updateSchedulerConfig(payload){ return apiFetch('/api/tfd/scheduler/config/',{method:'PATCH',body:JSON.stringify(payload)}) }
export function getSchedulerHealth(){ return apiFetch('/api/tfd/scheduler/health/') }
export function runSchedulerSelfTest(mode){ return apiFetch('/api/tfd/scheduler/self-test/',{method:'POST',body:JSON.stringify({mode})}) }
export function listEventJobs(){ return apiFetch('/api/tfd/scheduler/event-jobs/') }
