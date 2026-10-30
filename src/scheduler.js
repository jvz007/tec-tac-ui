import { apiFetch } from './api'
import { schedulesQuery } from './scheduler-creators.js'

export function listScheduledActions(){ return apiFetch('/api/tfd/scheduler/actions/') }
// 0.12.118: the optional second argument filters by creator and confirmer (Core 1.17.63). One argument sends what it always sent.
export function listSchedules(ownerType=null,{createdBy='',confirmedBy='',orphaned=false}={}){ const q=schedulesQuery(ownerType,{createdBy,confirmedBy,orphaned}); return apiFetch(`/api/tfd/scheduler/schedules/${q}`) }
export function getSchedule(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`) }
export function createSchedule(payload){ return apiFetch('/api/tfd/scheduler/schedules/',{method:'POST',body:JSON.stringify(payload)}) }
export function updateSchedule(id,payload){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/`,{method:'PATCH',body:JSON.stringify(payload)}) }
export function deleteSchedule(id,{force=false}={}){ const q=force?'?force=true':''; return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/${q}`,{method:'DELETE'}) }
export function runScheduleNow(id){ return apiFetch(`/api/tfd/scheduler/schedules/${encodeURIComponent(id)}/run/`,{method:'POST',body:JSON.stringify({})}) }
// 0.12.123 (Core 1.17.97): schedules whose owner module is not installed. Disable and Remove, one schedule or a whole module; the two bulk calls send {"confirm":true} after the UI's plain Yes or No.
export function listOrphanedSchedules(){ return apiFetch('/api/tfd/scheduler/orphaned/') }
export function disableOrphanedSchedule(id){ return apiFetch(`/api/tfd/scheduler/orphaned/${encodeURIComponent(id)}/disable/`,{method:'POST',body:JSON.stringify({})}) }
export function removeOrphanedSchedule(id){ return apiFetch(`/api/tfd/scheduler/orphaned/${encodeURIComponent(id)}/`,{method:'DELETE'}) }
export function disableOrphanedModule(moduleId){ return apiFetch(`/api/tfd/scheduler/orphaned/modules/${encodeURIComponent(moduleId)}/disable/`,{method:'POST',body:JSON.stringify({confirm:true})}) }
export function removeOrphanedModule(moduleId){ return apiFetch(`/api/tfd/scheduler/orphaned/modules/${encodeURIComponent(moduleId)}/`,{method:'DELETE',body:JSON.stringify({confirm:true})}) }
export function listScheduleRuns({scheduleId=null,ownerType=null,page=null,pageSize=null,search='',status=''}={}){ const params=new URLSearchParams(); if(scheduleId)params.set('schedule_id',scheduleId); if(ownerType)params.set('owner_type',ownerType); if(page)params.set('page',String(page)); if(pageSize)params.set('page_size',String(pageSize)); if(search)params.set('search',search); if(status)params.set('status',status); const q=params.toString()?`?${params.toString()}`:''; return apiFetch(`/api/tfd/scheduler/runs/${q}`) }

export function getSchedulerConfig(){ return apiFetch('/api/tfd/scheduler/config/') }
export function updateSchedulerConfig(payload){ return apiFetch('/api/tfd/scheduler/config/',{method:'PATCH',body:JSON.stringify(payload)}) }
export function getSchedulerHealth(){ return apiFetch('/api/tfd/scheduler/health/') }
export function runSchedulerSelfTest(mode){ return apiFetch('/api/tfd/scheduler/self-test/',{method:'POST',body:JSON.stringify({mode})}) }
export function listEventJobs(){ return apiFetch('/api/tfd/scheduler/event-jobs/') }
