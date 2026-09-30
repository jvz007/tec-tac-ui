import { reactive } from 'vue'

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
  if (value == null || value === '') return []
  return [String(value).trim()].filter(Boolean)
}

function normalizeRoutePatterns(value) {
  return [...new Set(asArray(value).filter((item) => item.startsWith('/')))]
}

function normalizeKeywords(value) {
  return [...new Set(asArray(value).map((item) => item.toLowerCase()))]
}

function stripFrontmatter(markdown = '') {
  const text = String(markdown || '').replace(/^\uFEFF/, '')
  if (!text.startsWith('---\n')) return text
  const end = text.indexOf('\n---\n', 4)
  return end >= 0 ? text.slice(end + 5) : text
}

function normalizeArticle(provider, source, moduleBase = null) {
  if (!source || typeof source !== 'object') throw new Error('help article registration requires an article descriptor')
  const id = String(source.id || '').trim()
  const title = String(source.title || '').trim()
  const category = String(source.category || (provider === 'core' ? 'Core' : provider)).trim()
  if (!id) throw new Error(`help article from ${provider} requires an id`)
  if (provider !== 'core' && !id.startsWith(`${provider}.`)) throw new Error(`help article id ${id} must begin with ${provider}.`)
  if (!title) throw new Error(`help article ${id} requires a title`)
  if (!category) throw new Error(`help article ${id} requires a category`)

  const content = source.content == null ? null : stripFrontmatter(String(source.content))
  let sourceUrl = null
  if (source.source != null && source.source !== '') {
    const path = String(source.source).trim()
    if (!moduleBase) throw new Error(`help article ${id} cannot use source without a module base URL`)
    if (path.startsWith('/') || path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split('/').includes('..')) {
      throw new Error(`help article ${id} source must be a relative path inside the module package`)
    }
    const resolved = new URL(path, moduleBase)
    if (resolved.origin !== window.location.origin) throw new Error(`help article ${id} source must stay on the Tec-Tac origin`)
    sourceUrl = resolved.href
  }
  if (!content && !sourceUrl) throw new Error(`help article ${id} requires content or source`)

  return {
    id,
    provider,
    title,
    category,
    summary: source.summary == null ? '' : String(source.summary).trim(),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 500,
    keywords: normalizeKeywords(source.keywords),
    routes: normalizeRoutePatterns(source.routes || source.route),
    content,
    sourceUrl,
    loaded: Boolean(content),
    loadError: '',
  }
}

function routeMatches(pattern, path) {
  if (!pattern || !path) return false
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2)
    return path === base || path.startsWith(`${base}/`)
  }
  return path === pattern
}

function routeSpecificity(article, path) {
  let best = -1
  for (const pattern of article.routes || []) {
    if (!routeMatches(pattern, path)) continue
    best = Math.max(best, pattern.replace(/\/\*$/, '').length)
  }
  return best
}

function articleText(article) {
  return [
    article.title,
    article.category,
    article.provider,
    article.summary,
    ...(article.keywords || []),
    stripFrontmatter(article.content || ''),
  ].join(' ').toLowerCase()
}

export function createHelpService() {
  const articles = reactive(new Map())
  const state = reactive({ drawerOpen: false, activeArticleId: null })

  function upsert(provider, source, moduleBase = null) {
    const article = normalizeArticle(provider, source, moduleBase)
    const existing = articles.get(article.id)
    if (existing && existing.provider !== provider) throw new Error(`help article ${article.id} is already owned by ${existing.provider}`)
    articles.set(article.id, article)
    return article
  }

  function removeProvider(provider) {
    for (const [id, article] of articles.entries()) {
      if (article.provider === provider) articles.delete(id)
    }
    if (state.activeArticleId && !articles.has(state.activeArticleId)) state.activeArticleId = null
  }

  async function load(id) {
    const article = articles.get(String(id || ''))
    if (!article) return null
    if (article.loaded || !article.sourceUrl) return article
    try {
      const response = await fetch(article.sourceUrl, { credentials: 'same-origin', cache: 'no-cache' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      article.content = stripFrontmatter(await response.text())
      article.loaded = true
      article.loadError = ''
    } catch (error) {
      article.loadError = error?.message || String(error)
      throw new Error(`Unable to load help article ${article.id}: ${article.loadError}`)
    }
    return article
  }

  async function hydrate() {
    const pending = [...articles.values()].filter((article) => !article.loaded && article.sourceUrl)
    await Promise.allSettled(pending.map((article) => load(article.id)))
  }

  function list() {
    return [...articles.values()].sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order || a.title.localeCompare(b.title))
  }

  function search(query = '', { category = null } = {}) {
    const q = String(query || '').trim().toLowerCase()
    return list()
      .filter((article) => !category || article.category === category)
      .filter((article) => !q || articleText(article).includes(q))
      .sort((a, b) => {
        if (!q) return a.category.localeCompare(b.category) || a.order - b.order || a.title.localeCompare(b.title)
        const aTitle = a.title.toLowerCase().includes(q) ? 0 : 1
        const bTitle = b.title.toLowerCase().includes(q) ? 0 : 1
        return aTitle - bTitle || a.category.localeCompare(b.category) || a.order - b.order || a.title.localeCompare(b.title)
      })
  }

  function forRoute(path) {
    const target = String(path || '')
    return [...articles.values()]
      .map((article) => ({ article, score: routeSpecificity(article, target) }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => b.score - a.score || a.article.order - b.article.order || a.article.title.localeCompare(b.article.title))
      .map((row) => row.article)
  }

  function open(id = null) {
    if (id != null && !articles.has(String(id))) throw new Error(`Help article ${id} is not registered.`)
    state.activeArticleId = id == null ? null : String(id)
    state.drawerOpen = true
    if (state.activeArticleId) void load(state.activeArticleId).catch(() => {})
  }

  function close() {
    state.drawerOpen = false
    state.activeArticleId = null
  }

  function registerCore(source) {
    const article = upsert('core', source, null)
    return () => {
      if (articles.get(article.id)?.provider === 'core') articles.delete(article.id)
    }
  }

  function forModule(moduleId, descriptor = {}) {
    const owned = new Set()
    const entry = String(descriptor?.entry || '').trim()
    const moduleBase = entry ? new URL('./', new URL(entry, window.location.origin)) : null
    return Object.freeze({
      register(source) {
        const article = upsert(moduleId, source, moduleBase)
        owned.add(article.id)
        return () => {
          if (articles.get(article.id)?.provider === moduleId) articles.delete(article.id)
          owned.delete(article.id)
        }
      },
      open(id) { return open(id) },
      openContext() { return open(null) },
      list() { return list().filter((article) => article.provider === moduleId) },
      clear() {
        for (const id of owned) {
          if (articles.get(id)?.provider === moduleId) articles.delete(id)
        }
        owned.clear()
      },
    })
  }

  return Object.freeze({
    state,
    registerCore,
    forModule,
    removeProvider,
    list,
    search,
    forRoute,
    get: (id) => articles.get(String(id || '')) || null,
    load,
    hydrate,
    open,
    close,
    snapshot: () => list().map(({ content, sourceUrl, loaded, loadError, ...article }) => ({
      ...article,
      source: sourceUrl ? 'module-markdown' : 'core-bundled',
      loaded,
      loadError,
    })),
  })
}
