// 0.13.2 (Core 1.18.42): the selection behind "Upgrade selected" on the Online catalog tab, kept out of ModulesView.vue so the
// page stays under its size cap. The page passes getters, never copies, so every answer reads the page's current values.
// Upgrade selected stages the batch; the page's own Install button, confirm and job panel do the rest.
import { computed, ref } from 'vue'
import { MAX_BATCH, eligibleIds, upgradeSelectedDisabled, upgradeSelectedHint } from './module-bulk-upgrade'

// deps: catalog(), repositories(), update(item), canManage(), busyElsewhere() -> { jobRunning, inspecting, staged }.
export function useBulkUpgrade(deps) {
  const bulkCtx = () => ({ update: deps.update, repositories: deps.repositories() })
  const bulkSelected = ref([])
  const upgradableCount = computed(() => eligibleIds(deps.catalog(), bulkCtx()).length)
  const bulkDisabled = computed(() => upgradeSelectedDisabled({ count: bulkSelected.value.length, canManage: deps.canManage(), ...deps.busyElsewhere() }))
  const bulkHint = computed(() => upgradeSelectedHint(bulkSelected.value.length) || (upgradableCount.value > MAX_BATCH ? `Select all picks the first ${MAX_BATCH}.` : ''))

  function selectAllUpgradable() { bulkSelected.value = eligibleIds(deps.catalog(), bulkCtx()).slice(0, MAX_BATCH) }
  function clearBulkSelection() { bulkSelected.value = [] }

  return { bulkCtx, bulkSelected, upgradableCount, bulkDisabled, bulkHint, selectAllUpgradable, clearBulkSelection }
}
