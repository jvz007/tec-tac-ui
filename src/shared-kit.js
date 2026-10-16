// Shared component kit for modules (0.12.114, brand board P1 table, P2 editor window, P3 form row, P5 stepper). Render-function
// components with no template strings, so modules need no compiler. They hold no values of their own: the module passes
// everything in and listens to events. Cell text, labels and titles are text nodes, never v-html. The rules live in
// shared-kit-logic.js. No component confirms or discards anything: a module asks one plain Yes or No through context.confirm.
import { defineComponent, h } from 'vue'
import {
  KIT_LIMITS,
  ariaSortFor,
  canSelectStep,
  cellText,
  cleanColumns,
  cleanSteps,
  editorKeyAction,
  keyedRows,
  nextSort,
  rowFocusMove,
  saveEnabled,
  stepState,
  tabbableIndex,
} from './shared-kit-logic.js'

export { KIT_LIMITS }

let sequence = 0
const nextId = (prefix) => {
  sequence += 1
  return `${prefix}-${sequence}`
}

// P1: the table. Sorting, selecting and the row menu are events; the module owns the rows and the order.
export const DataTable = defineComponent({
  name: 'TtDataTable',
  props: {
    columns: { type: Array, default: () => [] },
    rows: { type: Array, default: () => [] },
    rowKey: { type: String, default: undefined },
    selectedKey: { default: null },
    sortKey: { type: String, default: null },
    sortDir: { type: String, default: null },
    loading: { type: Boolean, default: false },
    emptyTitle: { type: String, default: KIT_LIMITS.emptyTitle },
    emptyText: { type: String, default: '' },
    footer: { type: String, default: '' },
    ariaLabel: { type: String, default: undefined },
    // cell(row, column) returns text or vnodes. Without it the cell shows row[column.key] as text.
    cell: { type: Function, default: undefined },
  },
  emits: ['sort', 'select', 'rowmenu', 'activate'],
  setup(props, { emit }) {
    let body = null
    const focusRow = (index) => {
      const row = body?.querySelectorAll?.('tr[data-row]')?.[index]
      try { row?.focus?.() } catch { /* a row that left the page cannot take focus */ }
    }
    // The module hears the column key and the direction the click asks for (ascending, descending, or null for none).
    const sortBy = (column) => {
      const next = nextSort(props.sortKey, props.sortDir, column.key)
      emit('sort', column.key, next.sortDir)
    }
    const onHeadKey = (event, column) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      sortBy(column)
    }
    const renderCell = (row, column) => {
      let value
      if (typeof props.cell === 'function') {
        try { value = props.cell(row, column) } catch { value = '' }
      } else {
        value = row && typeof row === 'object' ? row[column.key] : ''
      }
      if (value !== null && typeof value === 'object') return value
      return cellText(value)
    }

    return () => {
      const columns = cleanColumns(props.columns)
      const { items, capped } = keyedRows(props.rows, props.rowKey)
      const tab = tabbableIndex(items, props.selectedKey)
      const selected = props.selectedKey === null || props.selectedKey === undefined ? null : String(props.selectedKey)
      const head = h('thead', [h('tr', columns.map((column) => {
        const sort = column.sortable ? ariaSortFor(column.key, props.sortKey, props.sortDir) : undefined
        return h('th', {
          key: column.key,
          scope: 'col',
          class: [column.sortable ? 'sortable' : '', column.align === 'right' ? 'num' : ''],
          style: column.width ? { width: column.width } : undefined,
          'aria-sort': sort,
          tabindex: column.sortable ? 0 : undefined,
          onClick: column.sortable ? () => sortBy(column) : undefined,
          onKeydown: column.sortable ? (event) => onHeadKey(event, column) : undefined,
        }, column.label)
      }))])
      let rowsOut
      if (props.loading) {
        rowsOut = Array.from({ length: KIT_LIMITS.skeletonRows }, (_, r) => h('tr', { key: `s${r}`, 'aria-hidden': 'true' },
          columns.map((column) => h('td', { key: column.key, class: 'tt-skel' }, [h('i')]))))
      } else {
        rowsOut = items.map((item) => h('tr', {
          key: item.key,
          'data-row': item.key,
          tabindex: item.index === tab ? 0 : -1,
          'aria-selected': item.key === selected ? 'true' : 'false',
          onClick: () => emit('select', item.row),
          onDblclick: () => emit('activate', item.row),
          onContextmenu: (event) => { event.preventDefault(); emit('rowmenu', item.row, event) },
          onKeydown: (event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter') { event.preventDefault(); emit('activate', item.row); return }
            if (event.key === ' ') { event.preventDefault(); emit('select', item.row); return }
            const to = rowFocusMove(item.index, event.key, items.length)
            if (to >= 0) { event.preventDefault(); focusRow(to) }
          },
        }, columns.map((column) => h('td', { key: column.key, class: column.align === 'right' ? 'num' : '' }, [renderCell(item.row, column)]))))
      }
      const showEmpty = !props.loading && items.length === 0
      const footText = capped ? KIT_LIMITS.cappedText : props.footer
      return h('div', { class: 'tt-panel tt-ws' }, [
        h('div', { class: 'tt-tablewrap' }, [
          h('table', { class: 'tt-table', role: 'grid', 'aria-label': props.ariaLabel, 'aria-busy': props.loading ? 'true' : undefined, 'aria-rowcount': props.loading ? undefined : items.length + 1 }, [
            head,
            h('tbody', { ref: (el) => { body = el } }, rowsOut),
          ]),
        ]),
        props.loading ? h('div', { class: 'tt-sr', role: 'status' }, KIT_LIMITS.loadingText) : null,
        showEmpty
          ? h('div', { class: 'tt-table-empty', role: 'status' }, [h('b', props.emptyTitle), props.emptyText ? h('span', props.emptyText) : null])
          : null,
        footText ? h('div', { class: 'tt-table-foot' }, footText) : null,
      ])
    }
  },
})

// P3: one settings row. The label sits in a 220px column; under 760px it stacks. The control goes in the default slot. The
// module gives the control the id forId and, to link the help or the error, sets the control's aria-describedby to the ids
// this component prints (forId + '-hint' for help, forId + '-error' for the error).
export const FormRow = defineComponent({
  name: 'TtFormRow',
  props: {
    label: { type: String, default: '' },
    hint: { type: String, default: '' },
    help: { type: String, default: '' },
    error: { type: String, default: '' },
    forId: { type: String, default: undefined },
  },
  setup(props, { slots }) {
    const fallback = nextId('tt-frow')
    return () => {
      const base = props.forId || fallback
      return h('div', { class: 'tt-frow' }, [
        h('label', { for: props.forId }, [props.label, props.hint ? h('small', props.hint) : null]),
        h('div', { class: 'tt-ctl' }, [
          slots.default ? slots.default() : null,
          props.help ? h('span', { class: 'tt-help', id: `${base}-hint` }, props.help) : null,
          props.error ? h('span', { class: 'tt-error', id: `${base}-error`, role: 'alert' }, props.error) : null,
        ]),
      ])
    }
  },
})

// P2: the editor window. Named areas: actions (header), properties (left), content (default) and footer. Ctrl+S emits save;
// Escape and the close button emit close; the module asks one Yes or No when dirty. Discard only emits discard.
export const EditorWindow = defineComponent({
  name: 'TtEditorWindow',
  props: {
    title: { type: String, default: '' },
    dirty: { type: Boolean, default: false },
    canSave: { type: Boolean, default: false },
    saving: { type: Boolean, default: false },
    status: { type: String, default: '' },
  },
  emits: ['save', 'discard', 'close'],
  setup(props, { emit, slots }) {
    const titleId = nextId('tt-win-title')
    const onKeydown = (event) => {
      const action = editorKeyAction(event, { canSave: props.canSave, saving: props.saving })
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      if (action === 'close') emit('close')
      else if (action === 'save') emit('save')
    }
    return () => h('section', { class: 'tt-win tt-ws', role: 'group', 'aria-labelledby': titleId, onKeydown }, [
      h('div', { class: 'tt-win-head' }, [
        h('span', { class: 'tt-win-title', id: titleId }, props.title),
        props.dirty ? h('span', { class: 'tt-dirty', role: 'status' }, KIT_LIMITS.unsavedText) : null,
        h('div', { class: 'tt-win-actions' }, [
          slots.actions ? slots.actions() : null,
          h('button', { class: 'btn tt-iconbtn', type: 'button', title: KIT_LIMITS.closeLabel, 'aria-label': `${KIT_LIMITS.closeLabel} editor`, onClick: () => emit('close') }, '×'),
        ]),
      ]),
      h('div', { class: ['tt-win-body', { 'no-props': !slots.properties }] }, [
        slots.properties ? h('div', { class: 'tt-props' }, slots.properties()) : null,
        h('div', { class: 'tt-pane' }, [slots.content ? slots.content() : (slots.default ? slots.default() : null)]),
      ]),
      h('div', { class: 'tt-win-foot' }, [
        h('span', { class: 'tt-status', role: 'status', 'aria-live': 'polite' }, props.status),
        h('span', { class: 'spacer' }),
        slots.footer ? slots.footer() : null,
        h('button', { class: 'btn', type: 'button', disabled: !props.dirty || props.saving, onClick: () => emit('discard') }, 'Discard changes'),
        h('button', { class: 'btn primary', type: 'button', disabled: !saveEnabled(props), onClick: () => emit('save') }, props.saving ? 'Saving…' : 'Save'),
      ]),
    ])
  },
})

// P5: the stepper. Only an earlier step emits select, so going Back never loses values. The current step is the step whose key
// equals current. A step's state is 'done' or 'error'; anything else is a step still to do.
export const Stepper = defineComponent({
  name: 'TtStepper',
  props: {
    steps: { type: Array, default: () => [] },
    current: { type: String, default: '' },
    ariaLabel: { type: String, default: 'Steps' },
  },
  emits: ['select'],
  setup(props, { emit }) {
    return () => {
      const steps = cleanSteps(props.steps)
      const currentIndex = steps.findIndex((step) => step.key === props.current)
      return h('ol', { class: 'tt-steps tt-ws', 'aria-label': props.ariaLabel }, steps.map((step, index) => {
        const state = stepState(step, index, currentIndex)
        const marker = state === 'done' ? '✓' : state === 'error' ? '✕' : String(index + 1)
        const spoken = state === 'done' ? ' (done)' : state === 'error' ? ' (has an error)' : ''
        const inner = [h('b', { 'aria-hidden': 'true' }, marker), h('span', step.label), spoken ? h('span', { class: 'tt-sr' }, spoken) : null]
        return h('li', {
          key: step.key,
          class: { done: state === 'done', err: state === 'error' },
          'aria-current': state === 'current' ? 'step' : undefined,
        }, [canSelectStep(index, currentIndex)
          ? h('button', { type: 'button', class: 'tt-step', onClick: () => emit('select', step.key) }, inner)
          : h('span', { class: 'tt-step' }, inner)])
      }))
    }
  },
})
