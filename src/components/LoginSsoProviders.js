import { defineComponent, h } from 'vue'

export default defineComponent({
  name: 'LoginSsoProviders',
  props: {
    entries: { type: Array, default: () => [] },
    busy: { type: Boolean, default: false },
    ssoBusyId: { type: String, default: '' },
  },
  emits: ['begin'],
  setup(props, { emit }) {
    return () => {
      if (!props.entries.length) return null
      return h('div', { class: 'sso-provider-section' }, [
        h('div', { class: 'section-divider' }, 'OR SIGN IN WITH SSO'),
        h('div', { class: 'sso-provider-list' }, props.entries.map((entry) => (
          h('button', {
            key: entry.id,
            class: 'btn sso-provider-button',
            type: 'button',
            disabled: props.busy || !!props.ssoBusyId,
            title: entry.description || entry.label,
            onClick: () => emit('begin', entry),
          }, [
            entry.icon ? h('span', { 'aria-hidden': 'true' }, entry.icon) : null,
            h('span', null, props.ssoBusyId === entry.id ? 'Opening…' : entry.label),
          ]))
        )),
      ])
    }
  },
})
