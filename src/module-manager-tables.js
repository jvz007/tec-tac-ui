// 0.12.118: the Module Manager lists on the brand board's P1 pattern (the shared kit DataTable). This file holds the column lists,
// the cell builders and the sort. Cells are text or small elements built with h(): nothing from Core is ever markup. The page keeps
// all behaviour; a row is opened with a click, Enter or a double click, as the kit does.
import { h } from 'vue'
import { categoryBadge } from './module-category.js'
import { releaseLabels, skippedSummary } from './module-repository-info.js'
import { replacedByLabel, replacesLabel } from './module-replacement.js'

const sub = (text) => (text ? h('span', { class: 'sub' }, text) : null)
const pill = (text, tone = '') => h('span', { class: ['pill', tone] }, text)

export const INSTALLED_COLUMNS = [
  { key: 'id', label: 'Module', sortable: true },
  { key: 'version', label: 'Version', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  { key: 'runtime', label: 'Runtime', sortable: true },
  { key: 'visibility', label: 'Visibility', sortable: true },
  { key: 'dependencies', label: 'Dependencies', sortable: true, align: 'right' },
  { key: 'dependants', label: 'Dependants', sortable: true, align: 'right' },
  { key: 'uiLoad', label: 'UI load' },
  { key: 'status', label: 'Status', sortable: true },
]

const loadTone = (state) => (state === 'loaded' ? 'ok' : ['skipped', 'unknown'].includes(state) ? 'warn' : ['failed', 'runtime-error'].includes(state) ? 'danger' : '')

// diagnose(row) is the page's moduleLoadDiagnostic.
export function installedCell(diagnose) {
  return (item, column) => {
    switch (column.key) {
      case 'id': return h('span', [h('b', item.id), item.protected ? sub('protected') : null, sub(replacesLabel(item)), sub(replacedByLabel(item))])
      case 'version': return h('span', { class: 'mono' }, item.extension_version || '—')
      case 'category': {
        const badge = categoryBadge(item)
        return badge.known ? pill(badge.label, badge.tone) : h('span', { class: 'muted' }, '—')
      }
      case 'runtime': return pill(item.enabled ? 'enabled' : 'disabled', item.enabled ? 'ok' : 'warn')
      case 'visibility': return pill(item.visible !== false ? 'visible' : 'hidden', item.visible !== false ? 'ok' : '')
      case 'dependencies': return String(Object.keys(item.dependencies || {}).length)
      case 'dependants': return String(item.dependants?.length || 0)
      case 'uiLoad': { const d = diagnose(item); return pill(d.label, loadTone(d.state)) }
      case 'status': return pill(item.status || '—', item.status === 'enabled' ? 'ok' : 'warn')
      default: return ''
    }
  }
}

const SORT = {
  id: (r) => String(r.id || '').toLowerCase(),
  version: (r) => String(r.extension_version || ''),
  category: (r) => categoryBadge(r).label.toLowerCase(),
  runtime: (r) => (r.enabled ? 1 : 0),
  visibility: (r) => (r.visible !== false ? 1 : 0),
  dependencies: (r) => Object.keys(r.dependencies || {}).length,
  dependants: (r) => r.dependants?.length || 0,
  status: (r) => String(r.status || ''),
  name: (r) => String(r.name || r.id || '').toLowerCase(),
  installed: (r) => String(r.installed_version || ''),
  available: (r) => String(r.latest_version || ''),
  source: (r) => String(r.selected_repository_name || ''),
  repository: (r) => String(r.name || '').toLowerCase(),
  trust: (r) => String(r.trust || ''),
  priority: (r) => Number(r.priority || 0),
  state: (r) => (r.enabled ? 1 : 0),
  sync: (r) => String(r.sync?.status || 'never'),
  modules: (r) => Number(r.sync?.module_count || 0),
  onlineStatus: (r) => onlineStatusText(r),
}

// Sorted copy of rows for the column key and direction ('ascending', 'descending' or none). Never changes the input.
export function sortRows(rows, sortKey, sortDir) {
  const list = Array.isArray(rows) ? [...rows] : []
  const pick = SORT[sortKey]
  if (!pick || (sortDir !== 'ascending' && sortDir !== 'descending')) return list
  const sign = sortDir === 'ascending' ? 1 : -1
  return list.sort((a, b) => {
    const x = pick(a)
    const y = pick(b)
    if (x < y) return -1 * sign
    if (x > y) return 1 * sign
    return 0
  })
}

export const ONLINE_COLUMNS = [
  { key: 'name', label: 'Module', sortable: true },
  { key: 'installed', label: 'Installed', sortable: true },
  { key: 'available', label: 'Available', sortable: true },
  { key: 'source', label: 'Source', sortable: true },
  { key: 'compat', label: 'Compatibility' },
  { key: 'onlineStatus', label: 'Status', sortable: true },
  { key: 'action', label: '' },
]

export function onlineStatusText(item) {
  if (item.source_conflict) return 'source unavailable'
  if (item.update_available) return 'update available'
  if (item.installed) return 'up to date'
  return 'available'
}

// stage(item) starts the download and inspect; blocked(item) says whether the button is off.
export function onlineCell({ stage, blocked }) {
  return (item, column) => {
    switch (column.key) {
      case 'name': return h('span', [h('b', item.name || item.id), h('span', { class: 'sub mono' }, item.id)])
      case 'installed': return h('span', { class: 'mono' }, item.installed_version || '—')
      case 'available': return h('span', { class: 'mono' }, item.latest_version || '—')
      case 'source': return h('span', [
        h('span', item.selected_repository_name || 'local only'),
        item.selected_repository_trust ? h('span', { class: 'sub mono' }, item.selected_repository_trust) : null,
        releaseLabels(item).length ? h('span', { class: 'release-labels' }, releaseLabels(item).map((label) => h('span', { class: 'pill' }, label))) : null,
      ])
      case 'compat': return item.compatible === true ? pill('compatible', 'ok') : item.compatible === false ? pill('blocked', 'danger') : pill('unknown')
      case 'onlineStatus': {
        const text = onlineStatusText(item)
        return pill(text, item.source_conflict ? 'danger' : item.update_available ? 'warn' : item.installed ? 'ok' : '')
      }
      case 'action': return h('button', {
        class: ['btn', 'sm', item.update_available ? 'primary' : ''],
        type: 'button',
        disabled: blocked(item),
        onClick: (event) => { event.stopPropagation(); stage(item) },
      }, item.installed ? (item.update_available ? 'Download update' : 'Reinstall') : 'Download & inspect')
      default: return ''
    }
  }
}

export const REPOSITORY_COLUMNS = [
  { key: 'repository', label: 'Repository', sortable: true },
  { key: 'trust', label: 'Trust', sortable: true },
  { key: 'priority', label: 'Priority', sortable: true, align: 'right' },
  { key: 'state', label: 'State', sortable: true },
  { key: 'sync', label: 'Sync', sortable: true },
  { key: 'modules', label: 'Modules', sortable: true, align: 'right' },
  { key: 'action', label: '' },
]

export function repositoryCell({ sync, disabled }) {
  return (repo, column) => {
    switch (column.key) {
      case 'repository': return h('span', [h('b', repo.name), h('span', { class: 'sub mono' }, repo.id)])
      case 'trust': return pill(repo.trust)
      case 'priority': return String(repo.priority ?? '')
      case 'state': return h('span', [pill(repo.enabled ? 'enabled' : 'disabled', repo.enabled ? 'ok' : 'warn'), !repo.enabled ? sub('Enable it to sync.') : null])
      case 'sync': {
        const status = repo.sync?.status || 'never'
        return h('span', [
          pill(status, status === 'ok' ? 'ok' : status === 'error' ? 'danger' : status === 'never' ? 'warn' : ''),
          repo.sync?.error ? h('span', { class: 'sub dangertext' }, repo.sync.error) : null,
          sub(skippedSummary(repo.sync)),
        ])
      }
      case 'modules': return String(repo.sync?.module_count || 0)
      case 'action': return h('button', {
        class: 'btn sm',
        type: 'button',
        disabled: disabled(repo),
        onClick: (event) => { event.stopPropagation(); sync(repo) },
      }, 'Sync')
      default: return ''
    }
  }
}

// 0.12.119: the Hotfixes tab on the brand board. The preview targets and the applied hotfixes are P1 kit tables. The board keeps
// buttons out of table rows, so Roll back is an action bar above the applied table (ModuleHotfixes.vue); these cells hold text only.
const shortHash = (value) => {
  const hash = String(value || '').trim()
  return hash ? `${hash.slice(0, 12)}…` : '—'
}

export const HOTFIX_TARGET_COLUMNS = [
  { key: 'component', label: 'Component' },
  { key: 'path', label: 'Path' },
  { key: 'before', label: 'Before SHA256' },
  { key: 'after', label: 'After SHA256' },
]

export function hotfixTargetCell(target, column) {
  switch (column.key) {
    case 'component': return String(target?.component ?? '')
    case 'path': return h('span', { class: 'mono' }, String(target?.path ?? ''))
    case 'before': return h('span', { class: 'mono' }, shortHash(target?.sha256_before))
    case 'after': return h('span', { class: 'mono' }, shortHash(target?.sha256_after))
    default: return ''
  }
}

export const HOTFIX_APPLIED_COLUMNS = [
  { key: 'hotfix', label: 'Hotfix' },
  { key: 'base', label: 'Base' },
  { key: 'applied', label: 'Applied' },
  { key: 'files', label: 'Files', align: 'right' },
]

// format(value) is the page's date formatter (date-format.js), passed in so this file stays free of the shell state.
export function hotfixAppliedCell(format = (value) => String(value)) {
  const stamp = (value) => (value ? format(value) : '—')
  return (row, column) => {
    switch (column.key) {
      case 'hotfix': return h('span', [h('b', String(row?.id ?? '')), sub(row?.description || '—')])
      case 'base': return h('span', { class: 'mono' }, String(row?.base_version ?? ''))
      case 'applied': return h('span', [stamp(row?.applied_at), sub(row?.applied_by || 'unknown')])
      case 'files': return String(row?.targets?.length || 0)
      default: return ''
    }
  }
}
