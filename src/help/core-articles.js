import gettingStarted from './articles/getting-started.md?raw'
import coreUi from './articles/core-ui.md?raw'
import dashboards from './articles/dashboards.md?raw'
import schedules from './articles/schedules.md?raw'
import schedulerConfiguration from './articles/scheduler-configuration.md?raw'
import modules from './articles/modules.md?raw'
import access from './articles/access.md?raw'
import systemUpdates from './articles/system-updates.md?raw'
import storage from './articles/storage.md?raw'
import publicContracts from './articles/public-contracts.md?raw'
import preferences from './articles/preferences.md?raw'
import helpArticle from './articles/help.md?raw'
import troubleshootingDiagnostics from './articles/troubleshooting-diagnostics.md?raw'
import troubleshootingMigrations from './articles/troubleshooting-migrations.md?raw'

const CORE_ARTICLES = [
  { id: 'core.getting-started', title: 'Getting started with Tec-Tac', category: 'Getting Started', summary: 'Navigation, Help, preferences and the basic Tec-Tac shell.', order: 10, keywords: ['navigation', 'start', 'overview', 'ui'], routes: ['/dashboards'], content: gettingStarted },
  { id: 'core.interface', title: 'Tec-Tac interface', category: 'Core UI', summary: 'Shared controls, tables, dialogs, themes and status conventions.', order: 10, keywords: ['buttons', 'tables', 'dialogs', 'theme', 'interface'], routes: ['/preferences', '/preferences/menu-layout'], content: coreUi },
  { id: 'core.dashboards', title: 'Dashboards', category: 'Core', summary: 'Private/shared dashboards, widgets and default dashboard behavior.', order: 20, keywords: ['dashboard', 'widgets', 'default'], routes: ['/dashboards', '/dashboards/*'], content: dashboards },
  { id: 'core.schedules', title: 'Schedules', category: 'Core', summary: 'Create schedules, Run now, retries and execution history.', order: 30, keywords: ['scheduler', 'run now', 'timing', 'history'], routes: ['/schedules'], content: schedules },
  { id: 'core.scheduler-configuration', title: 'Scheduler Configuration', category: 'Core Administration', summary: 'Scheduler retention, runtime health and self-tests.', order: 10, keywords: ['scheduler', 'health', 'self-test', 'retention'], routes: ['/system/scheduler'], content: schedulerConfiguration },
  { id: 'core.modules', title: 'Modules', category: 'Core Administration', summary: 'Module lifecycle, bundles, dependencies, visibility and package inspection.', order: 20, keywords: ['modules', 'install', 'bundle', 'update', 'visibility'], routes: ['/modules'], content: modules },
  { id: 'core.access', title: 'Access', category: 'Core Administration', summary: 'Tactical identities, Tec-Tac permissions and role editing safeguards.', order: 30, keywords: ['access', 'roles', 'permissions', 'users'], routes: ['/access'], content: access },
  { id: 'core.system-updates', title: 'System Updates', category: 'Core Administration', summary: 'Framework/UI release discovery and controlled update lifecycle.', order: 40, keywords: ['updates', 'release', 'framework', 'ui'], routes: ['/system/updates'], content: systemUpdates },
  { id: 'core.storage', title: 'Storage & Housekeeping', category: 'Core Administration', summary: 'Storage visibility, retention and cleanup controls.', order: 50, keywords: ['storage', 'housekeeping', 'retention', 'cleanup'], routes: ['/system/storage'], content: storage },
  { id: 'core.troubleshooting-diagnostics', title: 'Troubleshooting & Diagnostics', category: 'Core Administration', summary: 'Read-only Core system diagnostics and health checks.', order: 55, keywords: ['diagnostics', 'troubleshooting', 'health', 'services', 'migration'], routes: ['/system/diagnostics'], content: troubleshootingDiagnostics },
  { id: 'core.troubleshooting-migrations', title: 'Migration drift', category: 'Troubleshooting', summary: 'Understand Core and module Django migration drift and the supported repair workflow.', order: 10, keywords: ['migration', 'makemigrations', 'drift', 'django'], routes: ['/system/diagnostics'], content: troubleshootingMigrations },
  { id: 'core.public-contracts', title: 'Public Contracts', category: 'Core Administration', summary: 'Developer contracts and safe cross-module integration boundaries.', order: 60, keywords: ['contracts', 'capabilities', 'api', 'integration'], routes: ['/contracts'], content: publicContracts },
  { id: 'core.preferences', title: 'Preferences and Menu Layout', category: 'Core UI', summary: 'Per-user appearance, navigation ordering and menu layout.', order: 20, keywords: ['preferences', 'menu layout', 'navigation', 'theme'], routes: ['/preferences', '/preferences/menu-layout'], content: preferences },
  { id: 'core.help', title: 'Help and Knowledge Base', category: 'Getting Started', summary: 'Context Help, full-text search and module-provided articles.', order: 20, keywords: ['help', 'knowledge base', 'documentation'], routes: ['/help', '/help/*'], content: helpArticle },
]

export function registerCoreHelpArticles(help) {
  for (const article of CORE_ARTICLES) help.registerCore(article)
}
