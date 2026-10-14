<script setup>
// 0.12.106: the Tactical UI preferences form on My Account (Core 1.17.35 PUT /api/tfd/account/tactical-ui/). The form is
// built from Core's answer, and its choice lists come from that answer, never from a list written here. Save sends only
// the changed fields. Core's refusal shows here as sent and nothing is applied. The parent applies the saved values.
import { computed, reactive, ref, watch } from 'vue'
import { changedFields, saveTacticalUiWorkflow, tacticalUiProblem } from '../my-account-workflows'
import { saveMyTacticalUiPreferences } from '../account'
import { formatWithPattern, unknownDateFormatLetters } from '../date-format'
import { resolveTacticalColour, TACTICAL_COLOUR_FIELDS } from '../tactical-ui-apply'

const props = defineProps({
  tacticalUi: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['saved'])

const busy = ref(false)
const error = ref('')
const COLOUR_LABELS = {
  loading_bar_color: 'Loading bar',
  dash_info_color: 'Info figures',
  dash_positive_color: 'Positive figures',
  dash_negative_color: 'Negative figures',
  dash_warning_color: 'Warning figures',
}
const COLOUR_FIELDS = Object.keys(TACTICAL_COLOUR_FIELDS)

function formFrom(source = {}) {
  const colours = {}
  for (const field of COLOUR_FIELDS) colours[field] = source[field] || TACTICAL_COLOUR_FIELDS[field].fallback
  return {
    agent_dblclick_action: source.agent_dblclick_action || 'editagent',
    url_action_id: source.url_action_id ?? null,
    dark_mode: source.dark_mode === true,
    show_community_scripts: source.show_community_scripts === true,
    clear_search_when_switching: source.clear_search_when_switching === true,
    default_agent_tbl_tab: source.default_agent_tbl_tab || '',
    client_tree_sort: source.client_tree_sort || '',
    client_tree_splitter: source.client_tree_splitter ?? 11,
    ...colours,
    date_format: source.date_format || '',
  }
}

const form = reactive(formFrom(props.tacticalUi))
watch(() => props.tacticalUi, (value) => { Object.assign(form, formFrom(value)) })

const changed = computed(() => changedFields(form, props.tacticalUi))
const hasChanges = computed(() => Object.keys(changed.value).length > 0)
const canRunUrlActions = computed(() => props.tacticalUi?.can_run_url_actions)
const problem = computed(() => (hasChanges.value ? tacticalUiProblem(form, changed.value, { canRunUrlActions: canRunUrlActions.value }) : ''))
const urlActionSelected = computed(() => form.agent_dblclick_action === 'urlaction')
const urlActionBlocked = computed(() => urlActionSelected.value && canRunUrlActions.value === false)
const dateExample = computed(() => (String(form.date_format || '').trim() ? formatWithPattern(new Date(), form.date_format) : new Date().toLocaleString()))
// 0.12.107: letters Tec-Tac writes as they are, which Tactical may read as date parts.
const unknownLetters = computed(() => unknownDateFormatLetters(form.date_format))

// The CSS colour the shell will show for a value, or null when Tec-Tac cannot show that name.
function shownColour(field) {
  return resolveTacticalColour(String(form[field] || '').trim())
}

async function save() {
  if (busy.value || !hasChanges.value || problem.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await saveTacticalUiWorkflow(form, {
      saveMyTacticalUiPreferences,
      original: props.tacticalUi,
      canRunUrlActions: canRunUrlActions.value,
    })
    emit('saved', result.preferences || props.tacticalUi, result.message)
  } catch (err) {
    error.value = err?.message || 'Unable to save Tactical UI preferences.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="card preference-card tactical-ui-card">
    <div class="cardhead"><div><span class="eyebrow">F4</span><h3>Tactical UI preferences</h3></div><span class="pill ok">TACTICAL</span></div>
    <p class="muted">These values are stored on your Tactical user account, so Tactical and Tec-Tac show the same choice. Tec-Tac applies the ones it can show.</p>

    <div v-if="error" class="auth-error" role="alert">{{ error }}</div>

    <h4 class="tactical-ui-group">Agent table</h4>
    <label class="field"><span>Agent double-click action</span><select v-model="form.agent_dblclick_action"><option v-for="item in tacticalUi.agent_dblclick_choices || []" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
    <label v-if="urlActionSelected" class="field"><span>Default URL Action</span><select v-model="form.url_action_id" :disabled="canRunUrlActions === false"><option :value="null">None</option><option v-for="item in tacticalUi.url_actions || []" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
    <p v-if="urlActionBlocked" class="muted smalltext">Your Tactical role does not permit URL Actions.</p>
    <label class="field"><span>Default agent table tab</span><select v-model="form.default_agent_tbl_tab"><option v-for="item in tacticalUi.default_agent_tbl_choices || []" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
    <label class="field"><span>Client tree sort</span><select v-model="form.client_tree_sort"><option v-for="item in tacticalUi.client_tree_sort_choices || []" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
    <label class="field"><span>Client tree splitter (1 to 99)</span><input v-model.number="form.client_tree_splitter" type="number" min="1" max="99" step="1"></label>
    <label class="permission-row"><input v-model="form.clear_search_when_switching" type="checkbox" role="switch" /><span class="permission-copy"><b>Clear search when switching</b></span></label>

    <h4 class="tactical-ui-group">Display</h4>
    <label class="permission-row"><input v-model="form.dark_mode" type="checkbox" role="switch" /><span class="permission-copy"><b>Dark mode in Tactical</b><span class="muted smalltext">Tactical's own theme. The Tec-Tac header theme is separate: change it in <router-link to="/preferences">Tec-Tac preferences</router-link>.</span></span></label>
    <label class="permission-row"><input v-model="form.show_community_scripts" type="checkbox" role="switch" /><span class="permission-copy"><b>Show community scripts</b></span></label>

    <h4 class="tactical-ui-group">Colours</h4>
    <p class="muted smalltext">Use a Quasar colour name such as red, or a # colour of 3, 4, 6 or 8 digits. Tec-Tac always shows these colours, Tactical's defaults included. High contrast shows its own theme colours instead.</p>
    <label v-for="field in COLOUR_FIELDS" :key="field" class="field tactical-colour-field">
      <span>{{ COLOUR_LABELS[field] }}</span>
      <span class="tactical-colour-row">
        <input v-model="form[field]" type="text" maxlength="40" autocomplete="off" :aria-describedby="`${field}-note`">
        <span class="tactical-swatch" aria-hidden="true" :style="shownColour(field) ? { background: shownColour(field) } : {}"></span>
      </span>
      <small :id="`${field}-note`" class="muted smalltext">{{ shownColour(field) ? 'Shown as this colour.' : 'Tec-Tac does not show this name, so the default colour is used.' }}</small>
    </label>

    <h4 class="tactical-ui-group">Dates</h4>
    <label class="field"><span>Date format (empty uses the browser default)</span><input v-model="form.date_format" type="text" maxlength="30" autocomplete="off" aria-describedby="date-format-example"></label>
    <p id="date-format-example" class="muted smalltext">Example: {{ dateExample }}. Letters: YYYY, MMM, DD, HH, mm, ss and so on. Text in [square brackets] is shown as written.<template v-if="unknownLetters.length"> Tec-Tac shows {{ unknownLetters.join(', ') }} as written. Tactical may read them as date parts.</template></p>

    <p v-if="problem" class="muted smalltext tactical-ui-problem">{{ problem }}</p>
    <div class="editor-actions"><button class="btn primary" :disabled="busy || !hasChanges || !!problem" @click="save">{{ busy ? 'Saving…' : 'Save Tactical preferences' }}</button></div>
  </section>
</template>
