import { apiBase, apiFetch, invalidateTacticalSession, tacticalToken } from './api'

export function getDeveloperContracts(){ return apiFetch('/api/tfd/contracts/') }

export async function downloadDeveloperContracts(format='md'){
  const base=apiBase(), token=tacticalToken()
  if(!base) throw new Error('Tactical API URL is unavailable.')
  if(!token) throw new Error('No Tactical access token is present in this browser session.')
  const response=await fetch(`${base}/api/tfd/contracts/export/?export_format=${encodeURIComponent(format)}`,{
    headers:{Accept:'*/*',Authorization:`Token ${token}`},
    credentials:'include',cache:'no-store'
  })
  if(!response.ok){
    let msg=`Contract export failed: ${response.status}`
    try{const p=await response.json();msg=p.detail||p.error||msg}catch{}
    if(response.status===401) invalidateTacticalSession(msg)
    const error=new Error(msg);error.status=response.status;throw error
  }
  const blob=await response.blob()
  const disposition=response.headers.get('content-disposition')||''
  const match=disposition.match(/filename="?([^";]+)"?/i)
  const filename=match?.[1]||`tec-tac-public-contracts.${format}`
  const url=URL.createObjectURL(blob), a=document.createElement('a')
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)
}
