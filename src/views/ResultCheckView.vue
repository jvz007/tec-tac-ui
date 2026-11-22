<script setup>
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getResultCheck } from '../api'
import { countPills, createResultCheckController, newResultCheckState, rangeText, rowsFromItems } from '../result-check'

const route = useRoute()
const state = reactive(newResultCheckState())
const controller = createResultCheckController({ fetchPage: getResultCheck, state })

const checkId = computed(() => String(route.params.checkId || ''))
const answer = computed(() => state.answer)
const rows = computed(() => rowsFromItems(answer.value?.items))
const pills = computed(() => countPills(answer.value?.summary))
const open = computed(() => answer.value?.status === 'open')
const range = computed(() => rangeText({ page: answer.value?.page || state.page, pageSize: answer.value?.page_size, shown: rows.value.length, total: Number(answer.value?.count || 0) }))
const hasPrevious = computed(() => (answer.value?.page || state.page) > 1)

watch(checkId, (id) => { if (id) controller.load(id, 1) }, { immediate: true })
onBeforeUnmount(() => controller.dispose())
</script>

<template>
<section>
  <div class="phead">
    <div>
      <span class="eyebrow">RESULTS</span>
      <h1>{{ answer?.label || 'Results' }}</h1>
      <p v-if="answer" class="mono">{{ answer.message }}</p>
    </div>
    <div class="rc-actions"><button class="btn sm" type="button" :disabled="state.loading" @click="controller.refresh()">Refresh</button></div>
  </div>

  <div v-if="state.notFound" class="callout" role="alert">{{ state.error }}</div>
  <div v-else-if="state.error" class="callout" role="alert">
    <span class="tt-error">{{ state.error }}</span>
    <div class="rc-actions"><button class="btn sm" type="button" :disabled="state.loading" @click="controller.refresh()">Retry</button></div>
  </div>
  <div v-else-if="!answer" class="callout mono">Loading results…</div>
  <template v-else>
    <div class="rc-counts mb" aria-label="Counts">
      <span v-for="pill in pills" :key="pill.id" class="pill" :class="pill.tone">{{ pill.label }}: {{ pill.value }}</span>
    </div>
    <div class="tt-panel">
      <div class="tt-tablewrap">
        <table class="tt-table">
          <thead><tr><th>Endpoint</th><th>State</th><th class="num">Exit code</th></tr></thead>
          <tbody>
            <tr v-for="row in rows" :key="row.key">
              <td>{{ row.endpoint }}</td>
              <td><span class="pill" :class="row.tone">{{ row.stateLabel }}</span></td>
              <td class="num mono">{{ row.exitCode }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="!rows.length" class="tt-table-empty"><b>No endpoints</b>This check has no endpoints to show.</div>
      </div>
      <div class="tt-table-foot rc-foot">
        <span>{{ range }}</span>
        <span v-if="open">Still checking. Use Refresh to see the latest.</span>
        <span class="spacer"></span>
        <button class="btn sm" type="button" :disabled="state.loading || !hasPrevious" @click="controller.previous()">Previous</button>
        <button class="btn sm" type="button" :disabled="state.loading || !answer.next_page" @click="controller.next()">Next</button>
      </div>
    </div>
  </template>
</section>
</template>

<style scoped>
.rc-counts{display:flex;flex-wrap:wrap;gap:6px}
.rc-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.rc-actions{display:flex;gap:8px;margin-top:8px}
</style>
