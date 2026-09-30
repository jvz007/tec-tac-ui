import { apiFetch, apiRaw } from './api'

export function getDeveloperContracts(){ return apiFetch('/api/tfd/contracts/') }

export async function downloadDeveloperContracts(format='md'){
  const response=await apiRaw(`/api/tfd/contracts/export/?export_format=${encodeURIComponent(format)}`,{
    headers:{Accept:'*/*'},
  })
  const blob=await response.blob()
  const disposition=response.headers.get('content-disposition')||''
  const match=disposition.match(/filename="?([^";]+)"?/i)
  const filename=match?.[1]||`tec-tac-public-contracts.${format}`
  const url=URL.createObjectURL(blob), a=document.createElement('a')
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)
}
