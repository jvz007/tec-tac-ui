<script setup>
import { computed, inject } from 'vue'

const notifications = inject('tecTacNotifications', null)
const history = computed(() => notifications?.history || { open: false, items: [], unreadCount: 0 })

function icon(level) {
  return level === 'success' ? '✓' : (level === 'warning' ? '!' : (level === 'error' ? '×' : 'i'))
}
function when(value) {
  if (!value) return ''
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff)) return value
  const minute = 60000
  if (diff < minute) return 'just now'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)}m ago`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))}h ago`
  return date.toLocaleString()
}
async function changeFilter(filter) { await notifications?.loadHistory?.({ filter }) }
</script>

<template>
  <div v-if="history.open" class="notice-drawer-backdrop" @click.self="notifications?.closeHistory?.()">
    <aside class="notice-drawer" role="dialog" aria-modal="true" aria-labelledby="notice-drawer-title">
      <header class="notice-drawer-head">
        <div><span class="eyebrow">USER HISTORY</span><h2 id="notice-drawer-title">Notifications</h2></div>
        <button type="button" class="iconbtn" title="Close notification history" aria-label="Close notification history" @click="notifications?.closeHistory?.()">×</button>
      </header>
      <div class="notice-toolbar">
        <div class="notice-tabs" role="tablist" aria-label="Notification history filter">
          <button type="button" :class="{ active: history.filter === 'all' }" @click="changeFilter('all')">All</button>
          <button type="button" :class="{ active: history.filter === 'unread' }" @click="changeFilter('unread')">Unread <span v-if="history.unreadCount">{{ history.unreadCount }}</span></button>
        </div>
        <div class="notice-actions">
          <button type="button" class="btn ghost xs" :disabled="!history.unreadCount" @click="notifications?.markAllRead?.()">Mark all read</button>
          <button type="button" class="btn ghost xs" @click="notifications?.clearRead?.()">Clear read</button>
        </div>
      </div>
      <div class="notice-list" aria-live="polite">
        <div v-if="history.loading && !history.loaded" class="notice-state"><span class="spinner" aria-hidden="true"></span> Loading notification history…</div>
        <div v-else-if="history.error" class="notice-state notice-state-error"><b>History unavailable</b><span>{{ history.error }}</span><button type="button" class="btn ghost xs" @click="notifications?.loadHistory?.()">Retry</button></div>
        <div v-else-if="!history.items.length" class="notice-state"><b>{{ history.filter === 'unread' ? 'No unread notifications' : 'No notification history yet' }}</b><span>New Tec-Tac notices will appear here after they are shown.</span></div>
        <article v-for="notice in history.items" :key="notice.id" class="notice-row" :class="[`notice-${notice.level}`, { unread: !notice.read, actionable: notice.action?.route }]" :tabindex="notice.action?.route ? 0 : undefined" @click="notice.action?.route && notifications?.activateHistoryNotice?.(notice)" @keydown.enter.prevent="notice.action?.route && notifications?.activateHistoryNotice?.(notice)">
          <div class="notice-row-marker" aria-hidden="true">{{ icon(notice.level) }}</div>
          <div class="notice-row-body">
            <div class="notice-row-top"><b>{{ notice.title || notice.message }}</b><span v-if="!notice.read" class="notice-unread-dot" title="Unread" aria-label="Unread"></span></div>
            <p v-if="notice.title">{{ notice.message }}</p>
            <div class="notice-row-meta"><span class="mono">{{ notice.source || 'core' }}</span><span>·</span><span>{{ when(notice.created_at) }}</span><button v-if="!notice.read" type="button" class="notice-mark-read" @click.stop="notifications?.markRead?.(notice)">Mark read</button></div>
            <button v-if="notice.action?.route" type="button" class="notice-route-action" @click.stop="notifications?.activateHistoryNotice?.(notice)">{{ notice.action.label || 'Open' }} →</button>
          </div>
        </article>
      </div>
      <footer class="notice-drawer-foot">History is retained for 30 days, up to the latest 500 notices per user.</footer>
    </aside>
  </div>
</template>
