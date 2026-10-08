import { defineComponent, Fragment, h, onErrorCaptured, ref, watch } from 'vue'

// Failure containment (rule 2.8). Wraps anything a module renders: a routed
// page, a header item or a dashboard widget. A throw in setup, render, a
// lifecycle hook, a watcher or an event handler of a wrapped component is
// caught here and never reaches the shell. The boundary shows a labelled
// "could not load" state with a Retry button instead.
//
// variant: 'page' (full panel), 'widget' (inline block), 'header' (a small
// marker that never breaks the top bar).
// resetKey: when it changes (for example route.fullPath) a failed boundary
// clears itself and renders its content again.
// recorder({ provider, variant, label, error, message, info }): lets the
// caller record the failure. The boundary itself imports nothing from Core.
export default defineComponent({
  name: 'ModuleErrorBoundary',
  props: {
    provider: { type: String, default: 'Core' },
    label: { type: String, default: '' },
    variant: { type: String, default: 'page' },
    resetKey: { type: [String, Number], default: '' },
    recorder: { type: Function, default: null },
  },
  setup(props, { slots }) {
    const failure = ref(null)
    const attempt = ref(0)

    onErrorCaptured((error, _instance, info) => {
      const message = error?.message || String(error)
      failure.value = { message, info: info || '' }
      try {
        props.recorder?.({
          provider: props.provider || 'Core',
          variant: props.variant,
          label: props.label || '',
          error,
          message,
          info: info || '',
        })
      } catch {
        // Recording must never turn a contained failure into a shell failure.
      }
      // Stop propagation: the failure stays inside this boundary.
      return false
    })

    watch(() => props.resetKey, () => { failure.value = null })

    function retry() {
      failure.value = null
      attempt.value += 1
    }

    return () => {
      if (!failure.value) return h(Fragment, { key: attempt.value }, slots.default ? slots.default() : [])

      const provider = props.provider || 'Core'
      const what = props.label ? `${provider}: ${props.label}` : provider
      const message = failure.value.message

      if (props.variant === 'header') {
        return h('span', {
          class: 'pill warn module-boundary-marker',
          role: 'img',
          title: `${what} could not load. ${message}`,
          'aria-label': `${what} could not load`,
        }, '!')
      }

      if (props.variant === 'widget') {
        return h('div', { class: 'state-inline denied module-boundary module-boundary-widget', role: 'alert' }, [
          h('b', null, `${what} could not load.`),
          h('code', { class: 'mono' }, message),
          h('button', { class: 'btn sm', type: 'button', onClick: retry }, 'Retry'),
        ])
      }

      return h('div', { class: 'state-panel danger-panel module-boundary module-boundary-page', role: 'alert' }, [
        h('span', { class: 'eyebrow' }, 'COULD NOT LOAD'),
        h('h2', null, `${what} could not load this page`),
        h('p', null, 'The rest of Tec-Tac is not affected. You can try again, or open another page.'),
        h('p', { class: 'mono' }, message),
        h('div', { class: 'row' }, [
          h('button', { class: 'btn', type: 'button', onClick: retry }, 'Retry'),
        ]),
      ])
    }
  },
})
