<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarkdownContent from './MarkdownContent.vue'

const help = inject('tecTacHelp', null)
const route = useRoute()
const router = useRouter()
const query = ref('')
const loadingArticle = ref(false)
const loadError = ref('')

const contextArticles = computed(() => help?.forRoute?.(route.path) || [])
const active = computed(() => help?.get?.(help?.state?.activeArticleId) || null)
const results = computed(() => query.value.trim() ? (help?.search?.(query.value).slice(0, 8) || []) : [])

watch(() => help?.state?.drawerOpen, (open) => {
  if (!open) query.value = ''
  else void help?.hydrate?.()
})

watch(() => help?.state?.activeArticleId, async (id) => {
  if (!id) { loadError.value = ''; return }
  loadingArticle.value = true
  loadError.value = ''
  try { await help?.load?.(id) } catch (error) { loadError.value = error?.message || 'Unable to load help article.' }
  finally { loadingArticle.value = false }
})

function openArticle(id) { help?.open?.(id) }
function back() { help?.open?.() }
function close() { help?.close?.() }
function openKnowledgeBase() {
  const id = help?.state?.activeArticleId
  close()
  router.push(id ? `/help/${encodeURIComponent(id)}` : '/help')
}
</script>

<template>
  <div v-if="help?.state?.drawerOpen" class="help-drawer-backdrop" @click.self="close">
    <aside class="help-drawer" role="dialog" aria-modal="true" aria-label="Tec-Tac Help">
      <div class="help-drawer-head">
        <div><span class="eyebrow">TEC-TAC HELP</span><h2>{{ active?.title || 'How can we help?' }}</h2></div>
        <button class="iconbtn" type="button" title="Close help" aria-label="Close help" @click="close">×</button>
      </div>

      <template v-if="active">
        <div class="help-drawer-meta"><button class="btn sm" type="button" @click="back">← Context help</button><span class="pill">{{ active.category }}</span><span class="muted smalltext mono">{{ active.provider }}</span></div>
        <div v-if="loadingArticle" class="callout mono">Loading article…</div>
        <div v-else-if="loadError" class="auth-error">{{ loadError }}</div>
        <MarkdownContent v-else :content="active.content || ''" />
      </template>

      <template v-else>
        <label class="search help-drawer-search"><span class="sr-only">Search Tec-Tac help</span><input v-model="query" placeholder="Search help…" @keydown.esc.stop.prevent="query=''" /></label>
        <template v-if="query.trim()">
          <div class="help-drawer-section-title">Search results</div>
          <button v-for="article in results" :key="article.id" class="help-result-row" type="button" @click="openArticle(article.id)"><span><b>{{ article.title }}</b><small>{{ article.summary || article.category }}</small></span><span class="mono">›</span></button>
          <div v-if="!results.length" class="state-inline"><b>No help articles found.</b> Try a broader search.</div>
        </template>
        <template v-else>
          <div class="help-drawer-section-title">On this page</div>
          <button v-for="article in contextArticles" :key="article.id" class="help-result-row" type="button" @click="openArticle(article.id)"><span><b>{{ article.title }}</b><small>{{ article.summary || article.category }}</small></span><span class="mono">›</span></button>
          <div v-if="!contextArticles.length" class="state-inline"><b>No page-specific article yet.</b> Search the knowledge base for related topics.</div>
        </template>
      </template>

      <div class="help-drawer-foot"><button class="btn primary" type="button" @click="openKnowledgeBase">Open Knowledge Base</button></div>
    </aside>
  </div>
</template>
