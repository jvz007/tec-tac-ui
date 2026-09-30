export default {
  async registerPublic(ctx) {
    const { h } = ctx.Vue
    ctx.addPublicRoute({
      path: '/public/reference',
      name: 'reference-public',
      meta: { title: 'Reference Public' },
      component: { setup: () => () => h('section', [h('h1', 'Reference public page')]) },
    })
  },
}
