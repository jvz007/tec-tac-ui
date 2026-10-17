// 0.12.116: FilterEditor, the one filter editor a module page mounts (Core 1.17.50, core.filter_sets 1.0.0, docs/module-filters.md).
// 0.12.117 adds date and number fields (Core 1.17.52, core.filter_sets 1.1.0): a date, a day range, a relative amount and unit, a
// number and a number range, all drawn from the field's own operators and the route's relative_units.
// A render-function component with no template strings, so modules need no compiler. It is bound to one module by
// createFilterEditorService().forModule(): the editor only ever uses the module id the loader fixed, and there is no module id prop.
// This is not a sandbox: the shared api helpers still reach Core's filter routes, and Core, not the editor, decides what the signed-in
// person may read for any module id. It builds only from what Core sends (the fields answer); it never invents a field or an
// operator and never sends a lookup, a row key or SQL. Every label is a text node, never raw HTML. Nothing is kept in browser
// storage. Calls go through the module's guarded api(), so a signed-out person makes no request.
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createKeyedLatestRequestGate } from './latest-request-gate.js'
import { SearchSelect } from './shared-components.js'
import { deepFreeze } from './shared-components-logic.js'
import {
  FILTER_LIMITS,
  FILTER_TEXT,
  addGroup,
  addLimit,
  addRule,
  cleanSearch,
  createBody,
  definitionKey,
  draftFromDefinition,
  emptyDefinition,
  fieldMap,
  isAbort,
  mergeOptions,
  nameProblem,
  normaliseDescriptor,
  normaliseSet,
  normaliseSets,
  normaliseValues,
  nodeAt,
  onlyMeReaders,
  readErrorMessage,
  removeNode,
  ruleValue,
  setErrorMessage,
  setMatch,
  setOption,
  setRuleField,
  setRuleOperator,
  setRuleValue,
  toDefinition,
  updateBody,
  validViewKey,
  valueHelp,
  valueMode,
  DATE_MAX,
  DATE_MIN,
} from './filter-editor-logic.js'

export { FILTER_LIMITS, FILTER_TEXT }

const SETS_URL = '/api/tfd/filter-sets/'
const FIELDS_URL = '/api/tfd/filter-sets/fields/'
const VALUES_URL = '/api/tfd/filter-values/'

let sequence = 0
const nextId = (prefix) => {
  sequence += 1
  return `${prefix}-${sequence}`
}

// ---- the value picker (one Equals or Does not equal rule) ----

// A SearchSelect for one field. 'distinct' reads Core's values route a page at a time (server mode); 'static' filters the
// descriptor's own options locally. The newest answer wins, an older one is dropped, and the request in flight is aborted.
const FilterValuePicker = defineComponent({
  name: 'TtFilterValuePicker',
  props: {
    fieldId: { type: String, required: true },
    source: { type: String, default: 'distinct' },
    options: { type: Array, default: () => [] },
    modelValue: { default: null },
    selectedLabel: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    invalid: { type: Boolean, default: false },
    describedBy: { type: String, default: undefined },
    ariaLabel: { type: String, default: undefined },
    load: { type: Function, default: undefined },
    track: { type: Function, default: undefined },
  },
  emits: ['pick', 'failed'],
  setup(props, { emit }) {
    const rows = ref(props.source === 'static' ? props.options : [])
    const loading = ref(false)
    const hasMore = ref(false)
    const gate = createKeyedLatestRequestGate(['values'])
    let wanted = null
    let page = 0
    let loaded = false
    let timer = null
    let controller = null
    let dead = false

    const stop = () => {
      clearTimeout(timer)
      timer = null
      try { controller?.abort?.() } catch { /* nothing to abort */ }
      controller = null
      gate.invalidate('values')
      loading.value = false
    }
    const untrack = typeof props.track === 'function' ? props.track(() => { dead = true; stop() }) : null
    onBeforeUnmount(() => { dead = true; stop(); if (typeof untrack === 'function') untrack() })

    async function fetchPage(text, n) {
      if (dead || typeof props.load !== 'function') return
      stop()
      const id = gate.begin('values')
      controller = typeof AbortController === 'function' ? new AbortController() : null
      wanted = text
      loading.value = true
      try {
        const answer = await props.load({ field: props.fieldId, search: text, page: n, signal: controller?.signal })
        if (dead || !gate.isCurrent('values', id)) return
        const result = normaliseValues(answer)
        rows.value = n === 1 ? result.options : mergeOptions(rows.value, result.options)
        hasMore.value = result.hasMore
        page = n
        loaded = true
        loading.value = false
      } catch (error) {
        if (dead || !gate.isCurrent('values', id) || isAbort(error)) return
        loading.value = false
        emit('failed', error)
      }
    }

    // The list opens with empty text (loads at once the first time); typed text waits 250 ms for the next key.
    const onSearch = (raw) => {
      if (props.source !== 'distinct') return
      const text = cleanSearch(raw)
      clearTimeout(timer)
      timer = null
      if (wanted === text && (loaded || loading.value)) return
      if (!loaded && !loading.value && text === '') { fetchPage('', 1); return }
      timer = setTimeout(() => { timer = null; fetchPage(text, 1) }, FILTER_LIMITS.debounceMs)
    }
    const onMore = () => {
      if (props.source !== 'distinct' || !hasMore.value || loading.value) return
      fetchPage(wanted || '', page + 1)
    }

    return () => h(SearchSelect, {
      modelValue: props.modelValue,
      options: props.source === 'static' ? props.options : rows.value,
      serverSearch: props.source === 'distinct',
      loading: loading.value,
      hasMore: hasMore.value,
      selectedLabel: props.selectedLabel,
      required: true,
      invalid: props.invalid,
      describedBy: props.describedBy,
      ariaLabel: props.ariaLabel,
      disabled: props.disabled,
      clearable: false,
      placeholder: 'Choose a value',
      onSearch,
      onMore,
      onSelect: (option) => emit('pick', option),
    })
  },
})

// ---- the editor ----

// Builds the component for one module. api, confirm and the gates are the module's own.
function makeFilterEditor({ id, call, confirm, getUserId, track }) {
  return defineComponent({
    name: 'TtFilterEditor',
    props: {
      viewKey: { type: String, required: true },
      modelValue: { default: null },
      disabled: { type: Boolean, default: false },
    },
    emits: ['update:modelValue', 'apply'],
    setup(props, { emit }) {
      const base = nextId('tt-filter')
      const state = ref('loading')
      const message = ref('')
      const descriptor = ref(null)
      const draft = ref(emptyDefinition())
      const sets = ref([])
      const setsMessage = ref('')
      const active = ref(null)
      const panel = ref(null)
      const notice = ref('')
      const actionError = ref('')
      const busy = ref(false)
      const failed = ref({})
      const gate = createKeyedLatestRequestGate(['fields', 'sets'])
      const controllers = new Set()
      let gone = false

      const dispose = () => {
        gone = true
        for (const controller of [...controllers]) { try { controller.abort() } catch { /* already done */ } }
        controllers.clear()
      }
      const untrack = track(dispose)
      onBeforeUnmount(() => { dispose(); untrack() })

      // One request with an abort handle, so leaving the page or the module being unloaded stops it.
      // A request with a key (the sets read) first aborts the earlier request with the same key.
      const keyed = new Map()
      function request(path, options = {}, key = '') {
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        if (controller) controllers.add(controller)
        if (key) {
          try { keyed.get(key)?.abort() } catch { /* already done */ }
          if (controller) keyed.set(key, controller)
        }
        return call(path, controller ? { ...options, signal: controller.signal } : options)
          .finally(() => { if (controller) { controllers.delete(controller); if (keyed.get(key) === controller) keyed.delete(key) } })
      }
      // Stops the fields and sets reads still in flight. Saves, renames and deletes use call() directly and are not touched.
      const abortReads = () => {
        for (const controller of [...controllers]) { try { controller.abort() } catch { /* already done */ } }
        controllers.clear()
        keyed.clear()
      }
      const fields = () => (descriptor.value ? descriptor.value.fields : [])
      const limits = () => descriptor.value?.limits || FILTER_LIMITS
      const mapOfFields = () => fieldMap(fields())
      const checked = () => toDefinition(draft.value, mapOfFields(), limits())
      const userReaders = () => { try { return onlyMeReaders(getUserId()) } catch { return null } }

      // ---- reading ----
      async function loadSets() {
        const seq = gate.begin('sets')
        setsMessage.value = ''
        const url = `${SETS_URL}?module=${encodeURIComponent(id)}&view_key=${encodeURIComponent(props.viewKey)}`
        try {
          const answer = await request(url, {}, 'sets')
          if (gone || !gate.isCurrent('sets', seq)) return
          sets.value = normaliseSets(answer)
          if (active.value && !sets.value.some((set) => set.id === active.value.id)) active.value = null
        } catch (error) {
          if (gone || !gate.isCurrent('sets', seq) || isAbort(error)) return
          setsMessage.value = readErrorMessage(error, FILTER_TEXT.setsFailed)
        }
      }

      function applyModel(model) {
        if (model === null || model === undefined) { draft.value = emptyDefinition(); return }
        const tree = draftFromDefinition(model, limits(), mapOfFields())
        if (!tree) { draft.value = emptyDefinition(); notice.value = 'The filter given to this editor could not be shown.'; return }
        draft.value = tree
      }

      async function load() {
        // A new view key: nothing read for the old one may fill the list or be picked again. This runs before any await.
        gate.invalidate('sets')
        abortReads()
        setsMessage.value = ''
        active.value = null
        panel.value = null
        sets.value = []
        notice.value = ''
        actionError.value = ''
        failed.value = {}
        if (!validViewKey(props.viewKey)) { state.value = 'badkey'; message.value = FILTER_TEXT.badViewKey; return }
        state.value = 'loading'
        const seq = gate.begin('fields')
        try {
          const answer = await request(`${FIELDS_URL}?module=${encodeURIComponent(id)}`)
          if (gone || !gate.isCurrent('fields', seq)) return
          const result = normaliseDescriptor(answer)
          descriptor.value = result
          if (!result.available) { state.value = 'unavailable'; message.value = FILTER_TEXT.noFilters; return }
          state.value = 'ready'
          applyModel(props.modelValue)
          loadSets()
        } catch (error) {
          // A refusal from the gate (signed out, abandoned, unloaded) is always shown, even when the editor was stopped at once.
          if (!error?.refused && (gone || !gate.isCurrent('fields', seq) || isAbort(error))) return
          state.value = 'error'
          message.value = readErrorMessage(error, FILTER_TEXT.fieldsFailed)
        }
      }
      onMounted(load)
      watch(() => props.viewKey, load)
      // A new modelValue from the page replaces the draft, unless it is what this editor just reported.
      watch(() => props.modelValue, (model) => {
        if (state.value !== 'ready') return
        const now = checked()
        const mine = now.problems.length ? '\u0000' : definitionKey(now.definition)
        const tree = model === null || model === undefined ? emptyDefinition() : draftFromDefinition(model, limits(), mapOfFields())
        const theirs = tree ? definitionKey(toDefinition(tree, mapOfFields(), limits()).definition) : '\u0001'
        if (mine === theirs) return
        applyModel(model)
      })

      // ---- editing ----
      function commit(next) {
        draft.value = next
        notice.value = ''
        const result = toDefinition(next, mapOfFields(), limits())
        if (!result.problems.length) emit('update:modelValue', result.definition)
      }
      const unchangedSet = () => {
        if (!active.value) return false
        const now = checked()
        return now.problems.length === 0 && definitionKey(now.definition) === active.value.key
      }
      function apply() {
        const now = checked()
        if (props.disabled || state.value !== 'ready' || now.problems.length) return
        const sameSet = unchangedSet()
        emit('update:modelValue', now.definition)
        emit('apply', sameSet ? { definition: null, filterSetId: active.value.id } : { definition: now.definition, filterSetId: null })
      }
      function clearAll() {
        active.value = null
        notice.value = ''
        draft.value = emptyDefinition()
        emit('update:modelValue', null)
      }

      // ---- saved sets ----
      function pick(option) {
        actionError.value = ''
        panel.value = null
        if (!option) { active.value = null; return }
        const set = sets.value.find((item) => item.id === option.value)
        if (!set) return
        if (!set.mine || !set.definition) {
          // Someone else's set is applied by its id; its rule values are not drawn here.
          draft.value = emptyDefinition()
          active.value = { id: set.id, name: set.name, key: '', mine: false, canEdit: false }
          notice.value = `"${set.name}"${set.owner ? ` by ${set.owner}` : ''} is selected. Its rules are not shown here. Apply uses it as it is.`
          return
        }
        const tree = draftFromDefinition(set.definition, limits(), mapOfFields())
        if (!tree) { active.value = null; notice.value = 'This set could not be shown here.'; return }
        draft.value = tree
        const result = toDefinition(tree, mapOfFields(), limits())
        active.value = { id: set.id, name: set.name, key: result.problems.length ? '\u0000' : definitionKey(result.definition), mine: true, canEdit: set.canEdit }
        notice.value = result.problems.length ? 'This set uses a field that is not available to you now. Fix or remove the rule, then Apply.' : ''
        if (!result.problems.length) emit('update:modelValue', result.definition)
      }

      function openPanel(mode) {
        actionError.value = ''
        panel.value = { mode, name: mode === 'rename' && active.value ? active.value.name : '', error: '' }
      }
      function afterWrite(response, definitionNow) {
        const set = normaliseSet(response)[0]
        if (!set) { loadSets(); return }
        const at = sets.value.findIndex((item) => item.id === set.id)
        const next = { ...set, definition: set.mine ? (definitionNow || set.definition) : null }
        if (at >= 0) sets.value = sets.value.map((item, i) => (i === at ? next : item))
        else sets.value = [...sets.value, next]
        active.value = { id: set.id, name: set.name, key: definitionNow ? definitionKey(definitionNow) : (active.value?.key || ''), mine: set.mine, canEdit: set.canEdit }
      }
      async function submitPanel() {
        const current = panel.value
        if (!current || busy.value) return
        const problem = nameProblem(current.name)
        if (problem) { panel.value = { ...current, error: problem }; return }
        busy.value = true
        try {
          if (current.mode === 'save') {
            const result = checked()
            const readers = userReaders()
            if (result.problems.length || !result.definition) { panel.value = { ...current, error: 'Finish the rules first. A set needs at least one complete rule.' }; return }
            if (!readers) { panel.value = { ...current, error: FILTER_TEXT.noUserId }; return }
            const body = createBody({ moduleId: id, viewKey: props.viewKey, name: current.name, definition: result.definition, readers })
            const response = await call(SETS_URL, { method: 'POST', body: JSON.stringify(body) })
            if (gone) return
            afterWrite(response, result.definition)
            notice.value = `Saved "${body.name}". Only you can use it.`
          } else {
            const body = active.value ? updateBody({ name: active.value.name, key: active.value.key }, { name: current.name }) : null
            if (body) {
              const response = await call(`${SETS_URL}${encodeURIComponent(active.value.id)}/`, { method: 'PUT', body: JSON.stringify(body) })
              if (gone) return
              afterWrite(response, null)
              notice.value = `Renamed to "${body.name}".`
            }
          }
          panel.value = null
        } catch (error) {
          if (gone || isAbort(error)) return
          panel.value = { ...panel.value, error: setErrorMessage(error, 'save') }
        } finally {
          busy.value = false
        }
      }
      async function replaceDefinition() {
        if (busy.value || !active.value || !active.value.canEdit) return
        const result = checked()
        if (result.problems.length || !result.definition) return
        const body = updateBody({ name: active.value.name, key: active.value.key }, { definition: result.definition })
        if (!body) return
        busy.value = true
        actionError.value = ''
        try {
          const response = await call(`${SETS_URL}${encodeURIComponent(active.value.id)}/`, { method: 'PUT', body: JSON.stringify(body) })
          if (gone) return
          afterWrite(response, result.definition)
          notice.value = `Saved your changes to "${active.value.name}".`
        } catch (error) {
          if (!gone && !isAbort(error)) actionError.value = setErrorMessage(error, 'save')
        } finally {
          busy.value = false
        }
      }
      async function removeSet() {
        const target = active.value
        if (busy.value || !target || !target.canEdit || typeof confirm !== 'function') return
        actionError.value = ''
        let yes = false
        try {
          yes = await confirm({ question: `Delete the filter set "${target.name}"?`, target: target.name, detail: 'This removes the set for good.', danger: true, yesLabel: 'Delete' })
        } catch { return }
        if (yes !== true || gone) return
        busy.value = true
        try {
          await call(`${SETS_URL}${encodeURIComponent(target.id)}/`, { method: 'DELETE' })
          if (gone) return
          sets.value = sets.value.filter((set) => set.id !== target.id)
          active.value = null
          panel.value = null
          notice.value = `Deleted "${target.name}".`
        } catch (error) {
          if (!gone && !isAbort(error)) actionError.value = setErrorMessage(error, 'delete')
        } finally {
          busy.value = false
        }
      }

      // ---- drawing ----
      // The picker owns its abort signal, so its call goes straight through the module's gated call().
      const loadForPicker = (args) => {
        const query = new URLSearchParams({ module: id, field: args.field })
        if (args.search) query.set('search', args.search)
        query.set('page', String(args.page))
        return call(`${VALUES_URL}?${query.toString()}`, args.signal ? { signal: args.signal } : {})
      }

      const select = (idAttr, label, value, options, onChange, disabled) => h('select', {
        id: idAttr,
        class: 'tt-filter-select',
        'aria-label': label,
        value,
        disabled,
        onChange: (event) => onChange(event.target.value),
      }, options.map((option) => h('option', { key: option.value, value: option.value, selected: option.value === value }, option.label)))

      function renderValue(rule, path, field) {
        const key = path.join('-')
        const mode = valueMode(field, rule.operator)
        const result = ruleValue(field, rule, limits())
        const errorId = `${base}-e-${key}`
        const problem = result.problem || ''
        const helpLines = valueHelp(field, rule.operator)
        const helpId = `${base}-h-${key}`
        const describedBy = [problem ? errorId : '', helpLines.length ? helpId : ''].filter(Boolean).join(' ') || undefined
        const common = { 'aria-label': `Value for ${field.label}`, 'aria-invalid': problem ? 'true' : undefined, 'aria-describedby': describedBy }
        const dayInput = (suffix, label, current, onChange) => h('input', {
          ...common,
          'aria-label': label,
          id: `${base}-v-${key}${suffix}`,
          class: 'tt-input',
          type: 'date',
          min: DATE_MIN,
          max: DATE_MAX,
          disabled: props.disabled,
          value: typeof current === 'string' ? current : '',
          onInput: (event) => onChange(event.target.value),
        })
        const constraints = field.constraints || {}
        const numberInput = (suffix, label, current, onChange) => h('input', {
          ...common,
          'aria-label': label,
          id: `${base}-v-${key}${suffix}`,
          class: 'tt-input',
          type: 'number',
          step: constraints.integer === true ? '1' : 'any',
          min: typeof constraints.minimum === 'number' ? String(constraints.minimum) : undefined,
          max: typeof constraints.maximum === 'number' ? String(constraints.maximum) : undefined,
          inputmode: constraints.integer === true ? 'numeric' : 'decimal',
          autocomplete: 'off',
          disabled: props.disabled,
          value: current === null || current === undefined ? '' : String(current),
          onInput: (event) => onChange(event.target.value),
        })
        const pair = rule.value && typeof rule.value === 'object' ? rule.value : {}
        let control
        if (mode.control === 'date') {
          control = dayInput('', `Value for ${field.label}`, rule.value, (raw) => commit(setRuleValue(draft.value, path, field, raw)))
        } else if (mode.control === 'date-range') {
          control = h('div', { class: 'tt-filter-pair' }, [
            dayInput('-from', `${field.label} from`, pair.from, (raw) => commit(setRuleValue(draft.value, path, field, { from: raw }))),
            dayInput('-to', `${field.label} to`, pair.to, (raw) => commit(setRuleValue(draft.value, path, field, { to: raw }))),
          ])
        } else if (mode.control === 'number') {
          control = numberInput('', `Value for ${field.label}`, rule.value, (raw) => commit(setRuleValue(draft.value, path, field, raw)))
        } else if (mode.control === 'number-range') {
          control = h('div', { class: 'tt-filter-pair' }, [
            numberInput('-from', `${field.label} from`, pair.from, (raw) => commit(setRuleValue(draft.value, path, field, { from: raw }))),
            numberInput('-to', `${field.label} to`, pair.to, (raw) => commit(setRuleValue(draft.value, path, field, { to: raw }))),
          ])
        } else if (mode.control === 'relative') {
          const unit = field.units.find((u) => u.id === pair.unit)
          control = h('div', { class: 'tt-filter-pair' }, [
            h('input', {
              ...common,
              'aria-label': `Amount for ${field.label}`,
              id: `${base}-v-${key}-amount`,
              class: 'tt-input',
              type: 'number',
              step: '1',
              min: '1',
              max: unit ? String(unit.max_amount) : undefined,
              inputmode: 'numeric',
              autocomplete: 'off',
              disabled: props.disabled,
              value: pair.amount === null || pair.amount === undefined ? '' : String(pair.amount),
              onInput: (event) => commit(setRuleValue(draft.value, path, field, { amount: event.target.value })),
            }),
            select(`${base}-v-${key}-unit`, `Unit for ${field.label}`, pair.unit || '', field.units.map((u) => ({ value: u.id, label: u.id })), (raw) => commit(setRuleValue(draft.value, path, field, { unit: raw })), props.disabled),
          ])
        } else if (mode.control === 'choice') {
          const text = rule.value === true ? 'true' : (rule.value === false ? 'false' : '')
          control = select(`${base}-v-${key}`, `Value for ${field.label}`, text, [{ value: '', label: 'Choose Yes or No' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], (raw) => commit(setRuleValue(draft.value, path, field, raw === 'true' ? true : (raw === 'false' ? false : null))), props.disabled)
        } else if (mode.control.startsWith('picker') && !(mode.control === 'picker-distinct' && failed.value[field.id])) {
          control = h(FilterValuePicker, {
            key: `${key}-${field.id}-${mode.control}`,
            fieldId: field.id,
            source: mode.control === 'picker-static' ? 'static' : 'distinct',
            options: field.options,
            modelValue: rule.value === '' ? null : rule.value,
            selectedLabel: typeof rule.label === 'string' && rule.label ? rule.label : (rule.value !== null && rule.value !== '' ? String(rule.value) : undefined),
            invalid: Boolean(problem),
            describedBy: problem ? errorId : undefined,
            ariaLabel: common['aria-label'],
            disabled: props.disabled,
            load: loadForPicker,
            track,
            onPick: (option) => commit(setRuleValue(draft.value, path, field, option ? option.value : null, option ? option.label : undefined)),
            onFailed: () => { failed.value = { ...failed.value, [field.id]: true } },
          })
        } else {
          const numeric = mode.type === 'id'
          control = h('input', {
            ...common,
            id: `${base}-v-${key}`,
            class: 'tt-input',
            type: 'text',
            inputmode: numeric ? 'numeric' : undefined,
            maxlength: numeric ? 15 : limits().valueLength,
            autocomplete: 'off',
            disabled: props.disabled,
            value: rule.value === null || rule.value === undefined ? '' : String(rule.value),
            onInput: (event) => commit(setRuleValue(draft.value, path, field, event.target.value, undefined, { box: true })),
          })
        }
        const fallback = mode.control === 'picker-distinct' && failed.value[field.id]
        return h('div', { class: 'tt-filter-value' }, [
          control,
          fallback ? h('span', { class: 'tt-help', role: 'status' }, FILTER_TEXT.valuesFailed) : null,
          helpLines.length ? h('span', { class: 'tt-help', id: helpId }, helpLines.join(' ')) : null,
          problem ? h('span', { class: 'tt-error', id: errorId, role: 'alert' }, problem) : null,
        ])
      }

      function renderRule(rule, path) {
        const key = path.join('-')
        const map = mapOfFields()
        const field = map.get(rule.field) || null
        const fieldOptions = [...(field ? [] : [{ value: '', label: 'Choose a field' }]), ...fields().map((item) => ({ value: item.id, label: item.label }))]
        return h('div', { class: 'tt-filter-rule', key: `r-${key}`, role: 'group', 'aria-label': `Rule ${path[path.length - 1] + 1}` }, [
          select(`${base}-f-${key}`, 'Field', field ? field.id : '', fieldOptions, (raw) => { const next = map.get(raw); if (next) commit(setRuleField(draft.value, path, next)) }, props.disabled),
          field
            ? select(`${base}-o-${key}`, `How to compare ${field.label}`, rule.operator, field.operators.map((op) => ({ value: op.id, label: op.label })), (raw) => commit(setRuleOperator(draft.value, path, field, raw)), props.disabled)
            : h('span', { class: 'tt-error', role: 'alert' }, FILTER_TEXT.chooseField),
          field ? renderValue(rule, path, field) : h('span'),
          h('button', { type: 'button', class: 'btn sm ghost tt-filter-remove', 'aria-label': `Remove rule ${path[path.length - 1] + 1}`, title: 'Remove rule', disabled: props.disabled, onClick: () => commit(removeNode(draft.value, path)) }, '×'),
        ])
      }

      function renderGroup(group, path) {
        const level = path.length + 1
        const key = path.join('-') || 'top'
        const ruleReason = addLimit(draft.value, path, 'rule', limits())
        const groupReason = addLimit(draft.value, path, 'group', limits())
        const reasonId = `${base}-r-${key}`
        const reasons = [...new Set([ruleReason, groupReason].filter(Boolean))]
        const children = group.rules.map((node, index) => (node.kind === 'group' ? renderGroup(node, [...path, index]) : renderRule(node, [...path, index])))
        return h('div', { class: ['tt-filter-group', { 'is-nested': level > 1 }], key: `g-${key}`, role: 'group', 'aria-label': level === 1 ? 'Filter rules' : `Group at level ${level}` }, [
          h('div', { class: 'tt-filter-head' }, [
            h('label', { class: 'tt-filter-match', for: `${base}-m-${key}` }, 'Match'),
            select(`${base}-m-${key}`, 'Match all or any rule in this group', group.match, [{ value: 'all', label: 'ALL of these' }, { value: 'any', label: 'ANY of these' }], (raw) => commit(setMatch(draft.value, path, raw)), props.disabled),
            level > 1 ? h('button', { type: 'button', class: 'btn sm ghost', 'aria-label': 'Remove this group', disabled: props.disabled, onClick: () => commit(removeNode(draft.value, path)) }, 'Remove group') : null,
          ]),
          ...children,
          !group.rules.length && level > 1 ? h('span', { class: 'tt-error', role: 'alert' }, FILTER_TEXT.emptyGroup) : null,
          !group.rules.length && level === 1 ? h('span', { class: 'tt-help' }, 'No rules yet. The list is not filtered.') : null,
          h('div', { class: 'tt-filter-add' }, [
            h('button', { type: 'button', class: 'btn sm', disabled: props.disabled || Boolean(ruleReason), 'aria-describedby': ruleReason ? reasonId : undefined, onClick: () => commit(addRule(draft.value, path, fields()[0], limits())) }, 'Add rule'),
            h('button', { type: 'button', class: 'btn sm', disabled: props.disabled || Boolean(groupReason), 'aria-describedby': groupReason ? reasonId : undefined, onClick: () => commit(addGroup(draft.value, path, limits())) }, 'Add group'),
            reasons.length ? h('span', { class: 'tt-help', id: reasonId }, reasons.join(' ')) : null,
          ]),
        ])
      }

      function renderSets() {
        const own = sets.value.filter((set) => set.mine).length
        const readers = userReaders()
        const result = checked()
        const canSaveNew = !props.disabled && !busy.value && !result.problems.length && !result.empty && own < FILTER_LIMITS.setsPerKey && Boolean(readers)
        let saveReason = ''
        if (!readers) saveReason = FILTER_TEXT.noUserId
        else if (own >= FILTER_LIMITS.setsPerKey) saveReason = `You already have ${FILTER_LIMITS.setsPerKey} sets for this list. Delete one to save another.`
        else if (result.problems.length || result.empty) saveReason = 'Add at least one complete rule to save a set.'
        const mine = active.value && active.value.mine && active.value.canEdit
        const edited = Boolean(active.value) && !unchangedSet()
        const panelNode = panel.value ? h('form', {
          class: 'tt-filter-panel',
          onSubmit: (event) => { event.preventDefault(); submitPanel() },
        }, [
          h('label', { class: 'tt-filter-match', for: `${base}-name` }, panel.value.mode === 'save' ? 'Name for this set' : 'New name'),
          h('input', {
            id: `${base}-name`,
            class: 'tt-input tt-filter-name',
            type: 'text',
            maxlength: FILTER_LIMITS.nameMax,
            autocomplete: 'off',
            'aria-invalid': panel.value.error ? 'true' : undefined,
            'aria-describedby': panel.value.error ? `${base}-name-e` : undefined,
            value: panel.value.name,
            onInput: (event) => { panel.value = { ...panel.value, name: event.target.value, error: '' } },
          }),
          h('button', { type: 'submit', class: 'btn sm primary', disabled: busy.value }, panel.value.mode === 'save' ? 'Save set' : 'Rename'),
          h('button', { type: 'button', class: 'btn sm ghost', disabled: busy.value, onClick: () => { panel.value = null } }, 'Cancel'),
          panel.value.error ? h('span', { class: 'tt-error tt-filter-wide', id: `${base}-name-e`, role: 'alert' }, panel.value.error) : null,
        ]) : null
        return h('div', { class: 'tt-filter-sets' }, [
          h('div', { class: 'tt-filter-setrow' }, [
            h('span', { class: 'tt-filter-match' }, 'Saved filters'),
            h('div', { class: 'tt-filter-setpick' }, [
              h(SearchSelect, {
                modelValue: active.value ? active.value.id : null,
                options: sets.value.map(setOption),
                ariaLabel: 'Saved filter sets',
                placeholder: sets.value.length ? 'Choose a saved filter' : 'No saved filters yet',
                disabled: props.disabled,
                clearable: true,
                onSelect: pick,
              }),
            ]),
            h('button', { type: 'button', class: 'btn sm', disabled: !canSaveNew, 'aria-describedby': saveReason ? `${base}-save-why` : undefined, onClick: () => openPanel('save') }, 'Save as new set'),
            mine ? h('button', { type: 'button', class: 'btn sm', disabled: props.disabled || busy.value || !edited || result.problems.length > 0 || result.empty, onClick: replaceDefinition }, 'Save changes') : null,
            mine ? h('button', { type: 'button', class: 'btn sm', disabled: props.disabled || busy.value, onClick: () => openPanel('rename') }, 'Rename') : null,
            mine && typeof confirm === 'function' ? h('button', { type: 'button', class: 'btn sm', disabled: props.disabled || busy.value, onClick: removeSet }, 'Delete') : null,
          ]),
          saveReason && !panel.value ? h('span', { class: 'tt-help', id: `${base}-save-why` }, saveReason) : null,
          panelNode,
          setsMessage.value ? h('span', { class: 'tt-error', role: 'alert' }, setsMessage.value) : null,
          actionError.value ? h('span', { class: 'tt-error', role: 'alert' }, actionError.value) : null,
          active.value && edited && active.value.mine ? h('span', { class: 'tt-help' }, 'You changed this set. Apply uses your changes. Save changes keeps them.') : null,
        ])
      }

      return () => {
        if (state.value === 'loading') return h('div', { class: 'tt-filter tt-ws' }, [h('span', { class: 'tt-help', role: 'status' }, 'Loading filters...')])
        if (state.value === 'unavailable' || state.value === 'badkey') return h('div', { class: 'tt-filter tt-ws' }, [h('span', { class: 'tt-help', role: 'status' }, message.value)])
        if (state.value === 'error') {
          return h('div', { class: 'tt-filter tt-ws' }, [
            h('span', { class: 'tt-error', role: 'alert' }, message.value),
            h('button', { type: 'button', class: 'btn sm', onClick: load }, 'Try again'),
          ])
        }
        const result = checked()
        const canApply = !props.disabled && !result.problems.length
        return h('div', { class: 'tt-filter tt-ws', role: 'group', 'aria-label': 'Filter' }, [
          renderSets(),
          nodeAt(draft.value, []) ? renderGroup(draft.value, []) : null,
          notice.value ? h('span', { class: 'tt-help', role: 'status' }, notice.value) : null,
          h('div', { class: 'tt-filter-actions' }, [
            h('button', { type: 'button', class: 'btn sm primary', disabled: !canApply, onClick: apply }, 'Apply'),
            h('button', { type: 'button', class: 'btn sm ghost', disabled: props.disabled, onClick: clearAll }, 'Clear'),
          ]),
        ])
      }
    },
  })
}

// ---- the per-module factory ----

export function createFilterEditorService() {
  return Object.freeze({
    // api is the module's guarded api(); confirm is the module-bound Yes or No; getUserId reads the signed-in person's id;
    // isSignedOut() and isAbandoned() come from the loader. The id is the loader's descriptor id, never an argument of the editor.
    forModule(moduleId, { api, confirm, getUserId, isSignedOut, isAbandoned } = {}) {
      if (typeof api !== 'function') throw new Error("FilterEditor needs the module's api helper")
      const id = String(moduleId ?? '')
      let shut = false
      const disposers = new Set()

      const refusalFor = () => {
        if (typeof isAbandoned === 'function' && isAbandoned()) return Object.assign(new Error(`module ${id} was abandoned after a failed or timed-out register(); FilterEditor is refused`), { refused: true })
        if (shut) return Object.assign(new Error(`module ${id} was unloaded; FilterEditor is refused`), { refused: true })
        if (typeof isSignedOut === 'function' && isSignedOut() === true) {
          return Object.assign(new Error('You are signed out. Sign in again to continue.'), { status: 401, payload: null, code: 'signed_out', refused: true })
        }
        return null
      }
      const call = (path, options) => {
        const refusal = refusalFor()
        if (refusal) return Promise.reject(refusal)
        try { return Promise.resolve(api(path, options)) } catch (error) { return Promise.reject(error) }
      }
      // A mounted editor or picker hands over a function that stops its timers and requests; clear() runs them all.
      const track = (disposer) => {
        if (shut) { try { disposer() } catch { /* already stopped */ } return () => {} }
        disposers.add(disposer)
        return () => { disposers.delete(disposer) }
      }
      const guardedConfirm = typeof confirm === 'function'
        ? (options) => { const refusal = refusalFor(); return refusal ? Promise.reject(refusal) : confirm(options) }
        : undefined
      const component = deepFreeze(makeFilterEditor({ id, call, confirm: guardedConfirm, getUserId: typeof getUserId === 'function' ? getUserId : () => null, track }))
      return Object.freeze({
        component,
        // Called by the loader when the module is unloaded or abandoned. Timers and requests stop; later calls are refused.
        clear() {
          shut = true
          for (const disposer of [...disposers]) { try { disposer() } catch { /* already stopped */ } }
          disposers.clear()
        },
      })
    },
  })
}
