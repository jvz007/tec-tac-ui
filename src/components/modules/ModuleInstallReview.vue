<script setup>
// 0.12.119: the staged-package review of the Module Manager on the brand board (P3 card, P1-style inspection table, P5 ordered
// cards, P10 states). Presentational only: values come in as props with the names ModulesView.vue gives them, handlers leave as
// events with the handler's name. The install order, the replacement texts and the guards are not here: they stay in ModulesView.vue.
// The inspection table is a token-only grid and not the kit DataTable: the kit's table wrapper clips (overflow hidden and auto),
// and the trust pill must open its detail popover over the table.
defineProps({
  staged: { type: Object, default: null },
  plan: { type: Object, default: null },
  orderedRows: { type: Array, default: () => [] },
  stagedArtifactLabel: { type: String, default: '' },
  stagedSourceLabel: { type: String, default: '' },
  queueWarning: { type: String, default: '' },
  jobRunning: { type: Boolean, default: false },
  installing: { type: Boolean, default: false },
  moduleTargetVersion: { type: Function, required: true },
  moduleRequirements: { type: Function, required: true },
  compactHash: { type: Function, required: true },
  isReplacementProblem: { type: Function, required: true },
  replacementProblemText: { type: Function, required: true },
})
const emit = defineEmits(['dragStart', 'dropOn', 'moveInspected', 'clearStaged', 'install'])
</script>

<template>
  <section v-if="staged" class="card mm-card mm-review mb" aria-labelledby="module-review-title">
    <div class="cardhead mm-cardhead">
      <div><span class="eyebrow">PACKAGE INSPECTION</span><h3 id="module-review-title">{{ orderedRows.length }} module{{ orderedRows.length===1?'':'s' }} ready for review</h3><p class="mm-lede">{{ stagedArtifactLabel }} · {{ stagedSourceLabel }}</p></div>
      <span class="pill" :class="plan?.valid ? 'ok' : 'warn'">{{ plan?.valid ? 'INSTALLABLE' : 'BLOCKED' }}</span>
    </div>
    <div class="mm-review-body">
      <div class="mm-inspection">
        <div class="mm-inspection-cols" aria-hidden="true">
          <span>Module</span><span>Installed</span><span>Package</span><span>Trust</span><span>Action</span><span>Source</span><span>SHA256</span><span>Requires</span>
        </div>
        <div v-for="row in orderedRows" :key="`inspect-${row.id}`" class="mm-inspection-row">
          <div class="mm-inspection-name"><b>{{ row.id }}</b><span class="mono">{{ row.intake_filename }}</span></div>
          <div data-label="Installed" class="mono">{{ row.current_version || 'not installed' }}</div>
          <div data-label="Package" class="mono mm-inspection-target">{{ moduleTargetVersion(row) }}</div>
          <div data-label="Trust" class="mm-trust-cell">
            <span
              v-if="row.intake_trust"
              class="pill mm-trust-badge"
              :class="row.intake_trust_class"
              tabindex="0"
              :aria-label="`Package trust: ${row.intake_trust_label}`"
            >
              {{ row.intake_trust_label === 'VERIFIED' ? 'SIGNED' : row.intake_trust_label }}
              <span class="mm-trust-popover" role="tooltip">
                <b>{{ row.intake_trust_label === 'VERIFIED' ? 'Signed package' : (row.intake_trust_label === 'UNSIGNED' ? 'Unsigned package' : row.intake_trust_label) }}</b>
                <template v-if="row.intake_trust.verified && row.intake_trust.trusted">
                  <span><strong>Publisher</strong>{{ row.intake_trust.publisher_display_name || row.intake_trust.publisher_id || '—' }}</span>
                  <span><strong>Publisher ID</strong><code>{{ row.intake_trust.publisher_id || '—' }}</code></span>
                  <span><strong>Key ID</strong><code>{{ row.intake_trust.key_id || '—' }}</code></span>
                  <span><strong>Algorithm</strong><code>{{ row.intake_trust.algorithm || 'Ed25519' }}</code></span>
                  <span><strong>Environment</strong><code>{{ row.intake_trust.publisher_environment || row.intake_trust.server_environment || '—' }}</code></span>
                  <span><strong>Assurance</strong><code>{{ row.intake_trust.assurance || 'standard' }}</code></span>
                  <span v-if="row.intake_trust.acceptance_policy"><strong>Acceptance</strong><code>{{ row.intake_trust.acceptance_policy.actual_label }} · minimum {{ row.intake_trust.acceptance_policy.minimum_label }}</code></span>
                  <span><strong>SHA256</strong><code>{{ row.intake_trust.package_sha256 || row.intake_sha256 || '—' }}</code></span>
                  <span><strong>Required</strong><code>{{ row.intake_trust.required_permissions?.length ? row.intake_trust.required_permissions.join(', ') : 'none' }}</code></span>
                  <span><strong>Approved</strong><code>{{ row.intake_trust.approved_permissions?.length ? row.intake_trust.approved_permissions.join(', ') : 'none' }}</code></span>
                </template>
                <template v-else-if="row.intake_trust.state==='unsigned' || row.intake_trust.signed===false">
                  <span class="mm-trust-note">No package signature was supplied.</span>
                  <span class="mm-trust-note">Unsigned packages are accepted only when the global Update Trust Policy and module-specific rules permit them.</span>
                  <span class="mm-trust-note">Privileged publisher permissions still require a trusted signature regardless of the global minimum.</span>
                </template>
                <template v-else>
                  <span class="mm-trust-note">{{ row.intake_trust.reason || row.intake_trust.error || 'Core did not accept the package trust material.' }}</span>
                </template>
              </span>
            </span>
            <span v-else class="pill mm-trust-badge" tabindex="0">NOT REPORTED</span>
          </div>
          <div data-label="Action"><span class="pill" :class="row.action==='replace'?'warn':'ok'">{{ row.action || 'install' }}</span></div>
          <div data-label="Source" class="mm-inspection-source">{{ row.intake_source || stagedSourceLabel }}</div>
          <div data-label="SHA256" class="mono mm-inspection-hash" :title="row.intake_sha256 || ''">{{ compactHash(row.intake_sha256) }}</div>
          <div data-label="Requires" class="mono mm-inspection-requires" :title="moduleRequirements(row)">{{ moduleRequirements(row) }}</div>
        </div>
      </div>
      <div class="state-inline mt" :class="plan?.valid ? '' : 'warning'"><b>{{ plan?.valid ? 'Dependency plan resolved.' : 'Installation blocked.' }}</b> {{ plan?.valid ? 'Required dependency sequence is enforced. Independent packages may be reordered.' : 'Resolve the dependency/version problems before installation.' }}</div><div v-if="staged.source" class="state-inline mt"><b>Online source:</b> {{ staged.source.repository_name }} <span class="mono">· {{ staged.source.repository_trust }} · {{ staged.source.package_sha256.slice(0,12) }}…</span></div>
      <div v-if="queueWarning" class="state-inline warning mt"><b>Order not changed.</b> {{ queueWarning }}</div>

      <div class="mm-queue-head mt"><span class="eyebrow">INSTALL SEQUENCE</span><span class="mono muted">{{ orderedRows.length }} package{{ orderedRows.length===1?'':'s' }}</span></div>
      <div class="mm-queue-list">
        <div
          v-for="(row,index) in orderedRows"
          :key="row.id"
          class="mm-queue-card mm-seq"
          draggable="true"
          @dragstart="emit('dragStart', row.id)"
          @dragover.prevent
          @drop.prevent="emit('dropOn', row.id)"
        >
          <span class="mm-queue-grip" title="Drag to reorder independent packages">⋮⋮</span>
          <span class="mm-queue-index mono">{{ index+1 }}</span>
          <div class="mm-queue-main"><b>{{ row.id }}</b><span class="mono">{{ row.current_version || 'not installed' }} → {{ row.version || row.extension_version || '—' }}</span></div>
          <div class="mm-queue-deps"><span class="label">REQUIRES</span><span class="mono">{{ Object.keys(row.dependencies||{}).length ? Object.entries(row.dependencies||{}).map(([id,v])=>`${id} ${v}`).join(' · ') : 'none' }}</span></div>
          <span class="pill" :class="row.action==='replace'?'warn':'ok'">{{ row.action || 'install' }}</span>
          <div class="mm-queue-actions"><button class="iconbtn" :disabled="index===0" title="Move up" @click="emit('moveInspected', row.id, -1)">↑</button><button class="iconbtn" :disabled="index===orderedRows.length-1" title="Move down" @click="emit('moveInspected', row.id, 1)">↓</button></div>
        </div>
      </div>

      <template v-if="plan?.problems?.length">
        <div class="section-divider">Blocking problems</div>
        <div v-for="(problem,index) in plan.problems" :key="index" class="state-inline warning mt"><template v-if="isReplacementProblem(problem)">{{ replacementProblemText(problem) }}</template><template v-else><span class="mono">{{ problem.module || 'plan' }}</span> — {{ problem.type }}</template><span v-if="problem.dependency">: {{ problem.dependency }} {{ problem.constraint }}</span></div>
      </template>

      <div class="mm-footer"><button class="btn" :disabled="jobRunning || installing" @click="emit('clearStaged')">Cancel / discard</button><span class="spacer"></span><span class="muted smalltext">The framework validates this sequence again before execution.</span><button class="btn primary" :disabled="!plan?.valid || !orderedRows.length || jobRunning || installing" @click="emit('install')">Install {{ orderedRows.length }} package{{ orderedRows.length===1?'':'s' }}</button></div>
    </div>
  </section>
</template>
