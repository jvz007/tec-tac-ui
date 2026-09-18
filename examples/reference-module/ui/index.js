export default {
  id: 'reference',
  async register(ctx) {
    const { Vue, router, addNavigation } = ctx
    const View = {
      name: 'TecTacReferenceModule',
      setup() {
        return () => Vue.h('section', {}, [
          Vue.h('div', { class: 'phead' }, [
            Vue.h('div', {}, [
              Vue.h('span', { class: 'eyebrow' }, 'DYNAMIC MODULE'),
              Vue.h('h1', {}, 'Reference module'),
              Vue.h('p', {}, 'This route was registered at runtime. The core tec-tac-ui bundle was not compiled with this page.'),
            ]),
          ]),
          Vue.h('div', { class: 'grid g2' }, [
            Vue.h('article', { class: 'card' }, [
              Vue.h('div', { class: 'cardhead' }, [Vue.h('h3', {}, 'Module contract'), Vue.h('span', { class: 'pill ok' }, 'loaded')]),
              Vue.h('dl', { class: 'kvlist' }, [
                Vue.h('dt', {}, 'Module ID'), Vue.h('dd', { class: 'mono' }, 'reference'),
                Vue.h('dt', {}, 'Route'), Vue.h('dd', { class: 'mono' }, '/extension/reference'),
                Vue.h('dt', {}, 'Loader'), Vue.h('dd', {}, 'Native ES module'),
                Vue.h('dt', {}, 'Authorization'), Vue.h('dd', {}, 'Backend authoritative'),
              ]),
            ]),
            Vue.h('article', { class: 'card' }, [
              Vue.h('div', { class: 'cardhead' }, [Vue.h('h3', {}, 'Runtime behaviour'), Vue.h('span', { class: 'pill' }, 'reference')]),
              Vue.h('div', { class: 'list' }, [
                Vue.h('div', { class: 'listrow' }, [Vue.h('span', { class: 'dot ok' }), Vue.h('b', {}, 'No shell rebuild'), Vue.h('span', {}, 'route registered dynamically')]),
                Vue.h('div', { class: 'listrow' }, [Vue.h('span', { class: 'dot ok' }), Vue.h('b', {}, 'Shared visual grammar'), Vue.h('span', {}, 'uses shell classes and tokens')]),
                Vue.h('div', { class: 'listrow' }, [Vue.h('span', { class: 'dot ok' }), Vue.h('b', {}, 'Trusted modules only'), Vue.h('span', {}, '0.1.0 rule')]),
              ]),
            ]),
          ]),
        ])
      },
    }

    router.addRoute({
      path: '/extension/reference',
      name: 'extension-reference',
      component: View,
      meta: { title: 'Reference Module' },
    })
    addNavigation({ label: 'Reference Module', icon: '◇', to: '/extension/reference' })
  },
}
