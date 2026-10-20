// Shared SearchSelect and TagEditor for modules (0.12.111, brand board patterns P6 script and report picker and P7 argument
// entry). Render-function components with no template strings, so modules need no compiler. They hold only their own
// transient input state (typed text, open list). The value always belongs to the module: they emit and never store it.
// Every label, description and value is a text node, never v-html. The rules live in shared-components-logic.js.
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  SELECT_LIMITS,
  TAG_LIMITS,
  addTag,
  chosenDisplayLabel,
  cleanOptions,
  comboKey,
  deepFreeze,
  firstEnabled,
  removeLastTag,
  removeTagAt,
  splitTyped,
  tagKey,
  visibleOptions,
  wantsMore,
} from './shared-components-logic.js'
import { DataTable, EditorWindow, FormRow, Stepper } from './shared-kit.js'

export { SELECT_LIMITS, TAG_LIMITS }

let sequence = 0
const nextId = (prefix) => {
  sequence += 1
  return `${prefix}-${sequence}`
}

// A chip tone is one of a few names; anything else gets no tone class.
const CHIP_TONES = new Set(['shell', 'accent', 'ok', 'warn', 'danger'])

// The list. Internal, but exported so a static render can show it open. It only draws; choosing goes through events.
export const SearchSelectList = defineComponent({
  name: 'TtSearchSelectList',
  props: {
    listId: { type: String, required: true },
    groups: { type: Array, default: () => [] },
    flat: { type: Array, default: () => [] },
    highlight: { type: Number, default: -1 },
    capped: { type: Boolean, default: false },
    capText: { type: String, default: SELECT_LIMITS.capText },
    loading: { type: Boolean, default: false },
    emptyText: { type: String, default: SELECT_LIMITS.emptyText },
    listStyle: { type: Object, default: () => ({}) },
  },
  emits: ['choose', 'end'],
  setup(props, { emit }) {
    // The press chooses and never moves the focus away from the input. A press on the scrollbar keeps the focus too.
    const onMousedown = (event) => {
      event.preventDefault()
      const row = event.target?.closest?.('li[data-i]')
      if (!row) return
      const index = Number(row.dataset.i)
      if (Number.isInteger(index)) emit('choose', index)
    }
    // Scrolled to the end of the list: the select may ask its module for the next page.
    const onScroll = (event) => {
      const el = event.target
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight <= 2) emit('end')
    }
    return () => {
      const showHeaders = props.groups.some((group) => group.key === 'favourites')
      const children = []
      let index = 0
      for (const group of props.groups) {
        if (showHeaders) children.push(h('li', { class: 'grp', role: 'presentation', key: `g-${group.key}` }, group.label))
        for (const option of group.options) {
          const i = index
          index += 1
          const tone = CHIP_TONES.has(option.chipTone) ? option.chipTone : ''
          children.push(h('li', {
            key: `o-${i}`,
            id: `${props.listId}-o${i}`,
            role: 'option',
            'data-i': String(i),
            'aria-selected': i === props.highlight ? 'true' : 'false',
            ...(option.disabled === true ? { 'aria-disabled': 'true' } : {}),
          }, [
            h('span', { class: 'tt-star', 'aria-hidden': 'true' }, option.favourite === true ? '★' : ''),
            h('span', [
              h('b', { class: 'tt-option-name' }, String(option.label ?? '')),
              option.description ? h('span', { class: 'd' }, String(option.description)) : null,
            ]),
            option.chip ? h('span', { class: ['tt-chip', tone] }, String(option.chip)) : h('span'),
          ]))
        }
      }
      if (!children.length && !props.loading) children.push(h('li', { class: 'none', role: 'presentation' }, props.emptyText))
      if (props.capped) children.push(h('li', { class: 'none', role: 'presentation' }, props.capText))
      if (props.loading) children.push(h('li', { class: 'none', role: 'presentation', 'data-loading': 'true' }, SELECT_LIMITS.loadingText))
      return h('ul', { id: props.listId, role: 'listbox', style: props.listStyle, 'aria-busy': props.loading ? 'true' : undefined, onMousedown, onScroll }, children)
    }
  },
})

export const SearchSelect = defineComponent({
  name: 'TtSearchSelect',
  props: {
    modelValue: { default: null },
    options: { type: Array, default: () => [] },
    placeholder: { type: String, default: '' },
    inputId: { type: String, default: undefined },
    ariaLabel: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    clearable: { type: Boolean, default: false },
    emptyText: { type: String, default: SELECT_LIMITS.emptyText },
    favouriteLabel: { type: String, default: SELECT_LIMITS.favouriteLabel },
    allLabel: { type: String, default: SELECT_LIMITS.allLabel },
    // Server mode (0.12.112), all off by default. The module owns the search and the paging: serverSearch skips the local
    // filter and the 300-row cap, search reports the typed text, loading shows one quiet line, hasMore with more asks for the
    // next page once, and selectedLabel names a chosen value that is not in the loaded rows.
    serverSearch: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    hasMore: { type: Boolean, default: false },
    selectedLabel: { type: String, default: undefined },
    // 0.12.114, all off by default: required sets aria-required, invalid sets aria-invalid and the field's invalid border,
    // describedBy sets aria-describedby to that id. They change nothing when absent.
    required: { type: Boolean, default: false },
    invalid: { type: Boolean, default: false },
    describedBy: { type: String, default: undefined },
  },
  emits: ['update:modelValue', 'select', 'search', 'more'],
  setup(props, { emit }) {
    const listId = nextId('tt-combo')
    const root = ref(null)
    const input = ref(null)
    const open = ref(false)
    const typed = ref(false)
    const text = ref('')
    const highlight = ref(-1)
    const listStyle = ref({})

    const chosen = computed(() => cleanOptions(props.options).find((option) => option.value === props.modelValue && props.modelValue !== null && props.modelValue !== undefined) || null)
    const chosenLabel = computed(() => chosenDisplayLabel(chosen.value, props.modelValue, props.selectedLabel))
    // Opening shows the full list; typing filters it (in server mode the module filters and the rows are shown as given).
    const view = computed(() => visibleOptions(props.options, typed.value ? text.value : '', {
      favouriteLabel: props.favouriteLabel,
      allLabel: props.allLabel,
      serverSearch: props.serverSearch,
    }))
    const capText = computed(() => (props.serverSearch ? SELECT_LIMITS.serverCapText : SELECT_LIMITS.capText))

    // Server mode: the module hears every change of the typed text and every opening of the list (the text is empty on opening).
    const emitSearch = (value) => { if (props.serverSearch) emit('search', value) }
    // The next page is asked for once for one set of options, until the options change or loading ends.
    let asked = false
    const maybeMore = (atEnd) => {
      if (!open.value) return
      if (wantsMore({ serverSearch: props.serverSearch, hasMore: props.hasMore, loading: props.loading, asked, count: view.value.flat.length, highlight: highlight.value, atEnd })) {
        asked = true
        emit('more')
      }
    }
    watch(() => props.options, () => { asked = false })
    watch(() => props.loading, (now, before) => { if (before && !now) asked = false })
    watch(highlight, () => maybeMore(false))
    // New rows from the module can leave the highlight past the end: put it back on the first enabled row.
    watch(() => view.value.flat.length, (count) => { if (open.value && highlight.value >= count) highlight.value = firstEnabled(view.value.flat) })
    const chosenIndex = computed(() => (chosen.value ? view.value.flat.indexOf(chosen.value) : -1))

    watch(chosenLabel, (label) => { if (!open.value) text.value = label }, { immediate: true })

    const placeList = () => {
      const el = root.value
      if (!el || typeof window === 'undefined') return
      const rect = el.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom - 8
      const above = rect.top - 8
      const up = below < 160 && above > below
      const room = Math.max(120, Math.min(260, up ? above : below))
      listStyle.value = up
        ? { left: `${rect.left}px`, width: `${rect.width}px`, bottom: `${window.innerHeight - rect.top + 3}px`, top: 'auto', maxHeight: `${room}px` }
        : { left: `${rect.left}px`, width: `${rect.width}px`, top: `${rect.bottom + 3}px`, bottom: 'auto', maxHeight: `${room}px` }
    }
    const watchPlacement = (on) => {
      if (typeof window === 'undefined') return
      const method = on ? 'addEventListener' : 'removeEventListener'
      window[method]('resize', placeList)
      window[method]('scroll', placeList, true)
    }
    const scrollToHighlight = () => nextTick(() => {
      if (typeof document === 'undefined' || highlight.value < 0) return
      document.getElementById(`${listId}-o${highlight.value}`)?.scrollIntoView?.({ block: 'nearest' })
    })

    const openList = (start) => {
      if (props.disabled || open.value) return
      open.value = true
      typed.value = false
      highlight.value = Number.isInteger(start) ? start : (chosenIndex.value >= 0 ? chosenIndex.value : firstEnabled(view.value.flat))
      placeList()
      watchPlacement(true)
      scrollToHighlight()
      emitSearch('')
    }
    const closeList = () => {
      if (open.value) watchPlacement(false)
      open.value = false
      typed.value = false
      highlight.value = -1
      text.value = chosenLabel.value
    }
    const choose = (option) => {
      if (!option || option.disabled === true) return
      emit('update:modelValue', option.value)
      emit('select', option)
      closeList()
      text.value = String(option.label ?? '')
    }
    const clear = () => {
      emit('update:modelValue', null)
      emit('select', null)
      closeList()
      text.value = ''
    }

    const onFocus = (event) => {
      openList()
      event?.target?.select?.()
    }
    const onInput = (event) => {
      if (props.disabled) return
      text.value = event.target.value
      typed.value = true
      if (!open.value) {
        open.value = true
        placeList()
        watchPlacement(true)
      }
      highlight.value = firstEnabled(view.value.flat)
      scrollToHighlight()
      emitSearch(text.value)
    }
    const onKeydown = (event) => {
      if (props.disabled || event.isComposing) return
      const result = comboKey({ open: open.value, highlight: highlight.value, flat: view.value.flat, chosenIndex: chosenIndex.value }, event.key)
      if (result.action === 'none' && !result.preventDefault) return
      if (result.preventDefault) event.preventDefault()
      if (result.stopPropagation) event.stopPropagation()
      if (result.action === 'open') openList(result.highlight)
      else if (result.action === 'move') { highlight.value = result.highlight; scrollToHighlight() }
      else if (result.action === 'choose') choose(view.value.flat[result.highlight])
      else if (result.action === 'close') closeList()
    }

    onBeforeUnmount(() => { if (open.value) watchPlacement(false) })

    return () => {
      const showClear = props.clearable && !props.disabled && chosen.value
      return h('div', { class: ['tt-combo', { 'tt-combo-clearable': Boolean(showClear) }], ref: root }, [
        h('input', {
          ref: input,
          id: props.inputId,
          class: 'tt-input',
          type: 'text',
          role: 'combobox',
          'aria-expanded': open.value ? 'true' : 'false',
          'aria-controls': listId,
          'aria-autocomplete': 'list',
          'aria-busy': open.value && props.loading ? 'true' : undefined,
          'aria-activedescendant': open.value && highlight.value >= 0 ? `${listId}-o${highlight.value}` : undefined,
          'aria-label': props.ariaLabel,
          'aria-required': props.required ? 'true' : undefined,
          'aria-invalid': props.invalid ? 'true' : undefined,
          'aria-describedby': props.describedBy || undefined,
          placeholder: props.placeholder || undefined,
          disabled: props.disabled,
          autocomplete: 'off',
          value: text.value,
          onFocus,
          onClick: () => openList(),
          onInput,
          onKeydown,
          onBlur: closeList,
        }),
        showClear
          ? h('button', {
            type: 'button',
            class: 'tt-clear',
            'aria-label': 'Clear selection',
            title: 'Clear selection',
            onMousedown: (event) => { event.preventDefault(); clear() },
          }, '×')
          : null,
        open.value
          ? h(SearchSelectList, {
            listId,
            groups: view.value.groups,
            flat: view.value.flat,
            highlight: highlight.value,
            capped: view.value.capped,
            capText: capText.value,
            loading: props.loading,
            emptyText: props.emptyText,
            listStyle: listStyle.value,
            onChoose: (index) => choose(view.value.flat[index]),
            onEnd: () => maybeMore(true),
          })
          : h('ul', { id: listId, role: 'listbox', hidden: true }),
      ])
    }
  },
})

export const TagEditor = defineComponent({
  name: 'TtTagEditor',
  props: {
    modelValue: { type: Array, default: () => [] },
    placeholder: { type: String, default: '' },
    ariaLabel: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    readonly: { type: Boolean, default: false },
    maxItems: { type: Number, default: TAG_LIMITS.maxItems },
    maxLength: { type: Number, default: TAG_LIMITS.maxLength },
    commaAdds: { type: Boolean, default: true },
    validate: { type: Function, default: undefined },
    // 0.12.118: id of the real text input and aria-describedby on it, as SearchSelect has. Off by default.
    inputId: { type: String, default: undefined },
    describedBy: { type: String, default: undefined },
  },
  emits: ['update:modelValue', 'reject'],
  setup(props, { emit }) {
    const input = ref(null)
    const draft = ref('')
    const problem = ref('')
    const values = computed(() => (Array.isArray(props.modelValue) ? props.modelValue.map(String) : []))
    const locked = computed(() => props.disabled || props.readonly)

    // Adds every value in the typed text. What was added or ignored leaves the box; a rejected value stays so it can be fixed.
    const commit = () => {
      if (locked.value) return
      let current = values.value
      let changed = false
      const kept = []
      problem.value = ''
      for (const part of splitTyped(draft.value, props.commaAdds)) {
        const result = addTag(current, part, { maxItems: props.maxItems, maxLength: props.maxLength, validate: props.validate })
        if (result.added) {
          current = result.values
          changed = true
        } else if (result.message) {
          kept.push(part)
          problem.value = result.message
          emit('reject', { value: result.value, reason: result.message })
        }
      }
      draft.value = kept.join(props.commaAdds === false ? '' : ',')
      if (changed) emit('update:modelValue', current)
    }
    const removeAt = (index) => {
      if (locked.value) return
      problem.value = ''
      emit('update:modelValue', removeTagAt(values.value, index))
      nextTick(() => input.value?.focus?.())
    }
    const onKeydown = (event) => {
      if (event.isComposing || locked.value) return
      const action = tagKey(event.key, { text: draft.value, commaAdds: props.commaAdds, hasValues: values.value.length > 0 })
      if (!action) return
      event.preventDefault()
      if (action === 'add') commit()
      else {
        problem.value = ''
        emit('update:modelValue', removeLastTag(values.value))
      }
    }

    return () => h('div', { class: 'tt-tageditor' }, [
      h('div', {
        class: ['tt-tagbox', { 'is-disabled': props.disabled, 'is-readonly': props.readonly }],
        onClick: (event) => { if (event.target === event.currentTarget) input.value?.focus?.() },
      }, [
        ...values.value.map((value, index) => h('span', { class: 'tt-tag', key: `${index}-${value}` }, [
          h('span', value),
          locked.value
            ? null
            : h('button', { type: 'button', 'aria-label': `Remove ${value}`, title: `Remove ${value}`, onClick: () => removeAt(index) }, '×'),
        ])),
        props.readonly
          ? null
          : h('input', {
            ref: input,
            id: props.inputId || undefined,
            class: 'tt-tag-input',
            type: 'text',
            'aria-label': props.ariaLabel,
            'aria-describedby': props.describedBy || undefined,
            'aria-invalid': problem.value ? 'true' : undefined,
            placeholder: props.placeholder || undefined,
            disabled: props.disabled,
            autocomplete: 'off',
            value: draft.value,
            onInput: (event) => { draft.value = event.target.value; problem.value = '' },
            onKeydown,
            onBlur: () => { if (draft.value.trim()) commit() },
          }),
      ]),
      problem.value ? h('span', { class: 'tt-error', role: 'alert' }, problem.value) : null,
    ])
  },
})

// What register(context).components holds. Frozen all the way down (each component's options object and its props), so a
// module cannot change what another module receives.
// 0.12.114 adds the kit (shared-kit.js): DataTable, FormRow, EditorWindow and Stepper.
// 0.12.116: this object stays these six. FilterEditor (filter-editor.js) is bound to one module, so the loader adds it to each
// module's own copy of context.components. registerPublic still gets no components.
export const sharedComponents = Object.freeze({
  SearchSelect: deepFreeze(SearchSelect),
  TagEditor: deepFreeze(TagEditor),
  DataTable: deepFreeze(DataTable),
  FormRow: deepFreeze(FormRow),
  EditorWindow: deepFreeze(EditorWindow),
  Stepper: deepFreeze(Stepper),
})
