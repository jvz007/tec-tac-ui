// 0.13.1 (Core 1.18.35): the state and handlers of "Upgrade selected" on the Online catalog tab, kept out of ModulesView.vue so the page
// stays under its size cap. The page passes getters, never copies, so every answer reads the page's current values.
// Flow: plan first (Core plans again at the run), then one plain Yes or No through the shell confirm, then the run and its progress.
import { computed, ref } from 'vue'
import { createLatestRequestGate } from './admin-session-state'
import { getOnlineUpgradeRun, planOnlineUpgrade, startOnlineUpgradeRun, stopOnlineUpgradeRun } from './modules'
import { bulkError, confirmOptions, createRunPoller, eligibleIds, installBody, planBody, planView, upgradeSelectedDisabled } from './module-bulk-upgrade'

// deps: catalog(), repositories(), update(item), canManage(), busyElsewhere() -> { jobRunning, inspecting, staged },
// confirm(options) -> Promise<boolean>, reloadLists() -> Promise.
export function useBulkUpgrade(deps) {
  const bulkCtx = () => ({ update: deps.update, repositories: deps.repositories() })
  const bulkSelected = ref([])
  const bulkPlan = ref(null)
  const bulkPlanBusy = ref(false)
  const bulkPlanError = ref('')
  const bulkRun = ref(null)
  const bulkRunNotice = ref('')
  const bulkRunError = ref('')
  const bulkStarting = ref(false)
  const bulkStopBusy = ref(false)
  const bulkRunActive = ref(false)
  const bulkGate = createLatestRequestGate()
  const bulkPlanGate = createLatestRequestGate()
  const bulkPoller = createRunPoller({
    gate: bulkGate,
    fetchRun: (runId) => getOnlineUpgradeRun(runId),
    onRun: (view) => { bulkRun.value = view; bulkRunError.value = '' },
    onError: (e) => { bulkRunError.value = bulkError(e, 'Could not read the run. Trying again.').message },
    onFinal: () => { bulkRunActive.value = false; bulkRunNotice.value = ''; void deps.reloadLists() },
  })
  const upgradableCount = computed(() => eligibleIds(deps.catalog(), bulkCtx()).length)
  const bulkDisabled = computed(() => upgradeSelectedDisabled({ count: bulkSelected.value.length, canManage: deps.canManage(), ...deps.busyElsewhere(), runActive: bulkRunActive.value, busy: bulkPlanBusy.value || bulkStarting.value }))

  function selectAllUpgradable() { bulkSelected.value = eligibleIds(deps.catalog(), bulkCtx()) }
  function clearBulkSelection() { bulkSelected.value = [] }
  function closeBulkPlan() { bulkPlanGate.begin(); bulkPlan.value = null; bulkPlanError.value = ''; bulkPlanBusy.value = false }
  function closeBulkRun() { bulkRun.value = null; bulkRunError.value = ''; bulkRunNotice.value = '' }
  async function planBulkUpgrade() {
    if (bulkDisabled.value) return
    const token = bulkPlanGate.begin()
    bulkPlan.value = null
    bulkPlanError.value = ''
    bulkPlanBusy.value = true
    try {
      const answer = await planOnlineUpgrade(planBody(bulkSelected.value))
      if (!bulkPlanGate.isCurrent(token)) return
      bulkPlan.value = planView(answer, bulkSelected.value)
    } catch (e) {
      if (!bulkPlanGate.isCurrent(token)) return
      if (e?.payload && typeof e.payload === 'object' && e.payload.ok === false && Number(e.status) !== 403) bulkPlan.value = planView({ ...e.payload, ok: false }, bulkSelected.value)
      else bulkPlanError.value = bulkError(e, 'Unable to plan the upgrade.').message
    } finally {
      if (bulkPlanGate.isCurrent(token)) bulkPlanBusy.value = false
    }
  }
  function followBulkRun(runId) {
    bulkRunActive.value = true
    bulkRun.value = null
    bulkPoller.start(runId)
  }
  async function startBulkUpgrade() {
    const view = bulkPlan.value
    if (!view?.canStart || bulkStarting.value || bulkRunActive.value) return
    if (!(await deps.confirm(confirmOptions(view.runnable.length, view.blocked.length)))) return
    bulkStarting.value = true
    bulkRunError.value = ''
    bulkRunNotice.value = ''
    try {
      const started = await startOnlineUpgradeRun(installBody(view.runnable))
      closeBulkPlan()
      bulkSelected.value = []
      if (typeof started?.run_id === 'string' && started.run_id) followBulkRun(started.run_id)
      else bulkRunError.value = 'Core started the run but sent no run id.'
    } catch (e) {
      const info = bulkError(e, 'Unable to start the upgrade.')
      closeBulkPlan()
      if (info.kind === 'follow') { bulkRunNotice.value = info.message; followBulkRun(info.runId) }
      else bulkRunError.value = info.message
    } finally {
      bulkStarting.value = false
    }
  }
  async function stopBulkRun() {
    const runId = bulkRun.value?.runId
    if (!runId || bulkStopBusy.value) return
    bulkStopBusy.value = true
    try {
      await stopOnlineUpgradeRun(runId)
    } catch (e) {
      const info = bulkError(e, 'Unable to stop the run.')
      if (info.kind !== 'stopped-done') bulkRunError.value = info.message
    } finally {
      bulkStopBusy.value = false
    }
  }

  return { bulkCtx, bulkSelected, bulkPlan, bulkPlanBusy, bulkPlanError, bulkRun, bulkRunNotice, bulkRunError, bulkStarting, bulkStopBusy, bulkRunActive, upgradableCount, bulkDisabled, bulkPoller, bulkPlanGate, selectAllUpgradable, clearBulkSelection, closeBulkPlan, closeBulkRun, planBulkUpgrade, startBulkUpgrade, stopBulkRun }
}
