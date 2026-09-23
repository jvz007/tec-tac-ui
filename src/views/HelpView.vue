<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarkdownContent from '../components/MarkdownContent.vue'

const help = inject('tecTacHelp', null)
const route = useRoute()
const router = useRouter()
const query = ref('')
const category = ref('')
const loading = ref(true)
const error = ref('')

const allArticles = computed(() => help?.list?.() || [])
const categories = computed(() => [...new Set(allArticles.value.map((article) => article.category))].sort())
const results = computed(() => help?.search?.(query.value, { category: category.value || null }) || [])
const selectedId = computed(() => route.params.articleId ? String(route.params.articleId) : '')
const selected = computed(() => selectedId.value ? help?.get?.(selectedId.value) : null)

async function hydrate() {
  loading.value = true
  error.value = ''
  try {
    await help?.hydrate?.()
    if (selectedId.value) await help?.load?.(selectedId.value)
  } catch (e) { error.value = e?.message || 'Unable to load knowledge base.' }
  finally { loading.value = false }
}

watch(selectedId, async (id) => {
  if (!id) return
  error.value = ''
  try { await help?.load?.(id) } catch (e) { error.value = e?.message || 'Unable to load help article.' }
})

function openArticle(id) { router.push(`/help/${encodeURIComponent(id)}`) }
function clearFilters() { query.value = ''; category.value = '' }
onMounted(hydrate)
</script>

<template>
<section>
  <div class="phead"><div><span class="eyebrow">KNOWLEDGE BASE</span><h1>Help</h1><p>Search Tec-Tac Core and installed-module guidance. Articles are versioned with the UI or module that provides them.</p></div><div class="row"><button v-if="selected" class="btn" @click="router.push('/help')">All articles</button></div></div>
  <div v-if="error" class="auth-error">{{ error }}</div>
  <div v-if="loading" class="callout mono">Loading knowledge base…</div>
  <template v-else>
    <div class="help-layout">
      <aside class="card help-index">
        <label class="search help-kb-search"><span class="sr-only">Search knowledge base</span><input v-model="query" placeholder="Search help…" @keydown.esc.stop.prevent="query=''" /></label>
        <div class="help-category-list">
          <button type="button" :class="{active:category===''}" @click="category=''">All <span>{{allArticles.length}}</span></button>
          <button v-for="item in categories" :key="item" type="button" :class="{active:category===item}" @click="category=item">{{item}} <span>{{allArticles.filter(a=>a.category===item).length}}</span></button>
        </div>
        <div class="section-divider">Articles</div>
        <div class="help-article-list">
          <button v-for="article in results" :key="article.id" type="button" :class="{active:selectedId===article.id}" @click="openArticle(article.id)"><b>{{article.title}}</b><span>{{article.summary || article.category}}</span><small class="mono">{{article.provider}}</small></button>
          <div v-if="!results.length" class="state-inline"><b>No articles match.</b><button class="btn sm" type="button" @click="clearFilters">Clear filters</button></div>
        </div>
      </aside>

      <article class="card help-reader">
        <template v-if="selected">
          <div class="help-reader-head"><div><span class="eyebrow">{{selected.category}} / {{selected.provider}}</span><h2>{{selected.title}}</h2><p v-if="selected.summary">{{selected.summary}}</p></div><span class="pill mono">{{selected.id}}</span></div>
          <MarkdownContent :content="selected.content || ''" />
        </template>
        <template v-else-if="selectedId">
          <div class="state-inline warning"><b>Help article not available.</b> The requested article is not registered by this Tec-Tac installation or its provider module is disabled.</div>
        </template>
        <template v-else>
          <div class="help-welcome"><span class="eyebrow">TEC-TAC KNOWLEDGE BASE</span><h2>Choose an article</h2><p>Use search or a category to find help. The top-right <b>?</b> button also shows guidance for the page you are currently viewing.</p><div class="grid g2 help-feature-grid"><article class="tile"><div class="lbl">Context help</div><div class="big">?</div><div class="brk">Relevant to the current route</div></article><article class="tile"><div class="lbl">Module help</div><div class="big">{{allArticles.filter(a=>a.provider!=='core').length}}</div><div class="brk">Provided by installed modules</div></article></div></div>
        </template>
      </article>
    </div>
  </template>
</section>
</template>
