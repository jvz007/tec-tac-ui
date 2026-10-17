// 0.12.117: the test runner. tests/run-all.mjs holds the whole ordered list (npm test runs it), because the old one-line script was
// 8043 characters and npm on Windows stops at 8191. This test embeds the 176 entries of the 0.12.116 script (package.json at git commit
// 311bc3a) as the expected set: every one is still in the runner, none twice, in the same order, and the new ones follow. It also runs
// the runner against a temporary list in the system temp folder (never in the tree): it runs in order, stops at the first failure,
// names the entry and exits non-zero.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const { ENTRIES, loadEntries, runAll } = await import(new URL('./run-all.mjs', import.meta.url).href)

const EXPECTED_0_12_116 = [
  'bash tests/foundation.sh',
  'bash tests/session-security-ui.sh',
  'bash tests/mfa-admin-recovery-ui.sh',
  'bash tests/release-workflow-lockfile.sh',
  'bash tests/history-pagination-ui.sh',
  'bash tests/login-session-pagination-ui.sh',
  'bash tests/scheduler-history-pagination-ui.sh',
  'bash tests/account-security-policy-ui.sh',
  'bash tests/d5-scope-health-ui.sh',
  'node tests/d5-scope-health.mjs',
  'node tests/core-navigation-resources.mjs',
  'bash tests/ui-hygiene-0.12.45.sh',
  'bash tests/ui-0.12.46.sh',
  'bash tests/ui-partial-closure-0.12.47.sh',
  'bash tests/ui-tracker-closure-0.12.48.sh',
  'bash tests/ui-0.12.49.sh',
  'bash tests/ui-0.12.50.sh',
  'bash tests/ui-0.12.51.sh',
  'bash tests/ui-0.12.52.sh',
  'bash tests/ui-0.12.53.sh',
  'bash tests/ui-0.12.54.sh',
  'bash tests/ui-tracker-open-closure-0.12.55.sh',
  'node tests/release-notes-l74.mjs',
  'bash tests/ui-0.12.56.sh',
  'node tests/ui-l69-resource-search-0.12.57.mjs',
  'node tests/ui-0.12.57-1.mjs',
  'node tests/ui-0.12.57-2.mjs',
  'bash tests/ui-backup-restore-d2-d3-0.12.58.sh',
  'node tests/api-contract-routes-0.12.58-1.mjs',
  'node tests/ui-backup-restore-d2-d3-0.12.59.mjs',
  'node tests/my-account-0.12.60.mjs',
  'node tests/resource-features-0.12.61.mjs',
  'node tests/extension-hooks-0.12.62.mjs',
  'node tests/feature-closure-0.12.63.mjs',
  'node tests/browser-contract-catalog-0.12.64.mjs',
  'node tests/tracker-final-closure-0.12.65.mjs',
  'node tests/backup-restore-final-closure-0.12.65.mjs',
  'node tests/f1-f2-my-account-done-when-0.12.66.mjs',
  'node tests/f4-runtime-context-done-when-0.12.66.mjs',
  'node tests/f5-f7-resources-done-when-0.12.66.mjs',
  'node tests/f8-f10-extension-surfaces-done-when-0.12.66.mjs',
  'node tests/tracker-acceptance-0.12.67.mjs',
  'node tests/d3-f4-production-closure-0.12.68.mjs',
  'node tests/f9-f10-production-closure-0.12.69.mjs',
  'node tests/f1-password-error-0.12.70.mjs',
  'node tests/networkprobe-runtime-context-0.12.71.mjs',
  'node tests/f8-sso-completion-0.12.72.mjs',
  'node tests/d3-seamless-restore-0.12.74.mjs',
  'node tests/f1-f8-tracker-closure-0.12.75.mjs',
  'node tests/f8-oidc-done-when-0.12.76.mjs',
  'node tests/f8-tactical-native-sso-0.12.77.mjs',
  'node tests/f8-public-module-login-e2e-0.12.78.mjs',
  'node tests/d3-ad3-seamless-restore-0.12.80.mjs',
  'node tests/api-error-shape-0.12.81.mjs',
  'node tests/module-failure-containment-0.12.81.mjs',
  'node tests/module-register-timeout-0.12.81.mjs',
  'node tests/hidden-when-denied-0.12.81.mjs',
  'bash tests/csp-nginx-0.12.81.sh',
  'node tests/runtime-settings-control-0.12.81.mjs',
  'node tests/module-navigation-scope-0.12.82.mjs',
  'node tests/update-source-0.12.82.mjs',
  'node tests/module-runtime-docs-0.12.82.mjs',
  'bash tests/csp-report-only-default-0.12.83.sh',
  'bash tests/csp-prod-url-0.12.83.sh',
  'node tests/csp-violations-0.12.83.mjs',
  'node tests/system-settings-page-0.12.83.mjs',
  'node tests/update-source-stage-0.12.83.mjs',
  'node tests/discovered-version-0.12.84.mjs',
  'node tests/stable-release-0.12.85.mjs',
  'node tests/update-source-superuser-0.12.86.mjs',
  'node tests/stable-release-branch-switch-0.12.86.mjs',
  'node tests/tactical-operations-0.12.87.mjs',
  'node tests/tactical-permissions-context-0.12.87.mjs',
  'node tests/stable-release-not-refreshed-0.12.87.mjs',
  'node tests/tactical-operation-scope-0.12.88.mjs',
  'node tests/module-replacement-status-0.12.88.mjs',
  'node tests/tactical-operation-binding-0.12.89.mjs',
  'node tests/module-replacement-confirm-0.12.89.mjs',
  'node tests/stable-release-cached-0.12.89.mjs',
  'node tests/module-replacement-handback-0.12.90.mjs',
  'node tests/module-category-0.12.91.mjs',
  'node tests/tactical-operations-query-file-0.12.91.mjs',
  'node tests/module-replacement-second-empty-0.12.91.mjs',
  'node tests/module-handback-warning-0.12.92.mjs',
  'node tests/notice-stream-toast-0.12.92.mjs',
  'node tests/upload-limit-setting-0.12.92.mjs',
  'node tests/endpoint-grid-columns-0.12.93.mjs',
  'node tests/tactical-scope-context-0.12.93.mjs',
  'node tests/module-intake-sets-0.12.94.mjs',
  'node tests/topbar-stacking-0.12.94.mjs',
  'node tests/popup-mode-0.12.95.mjs',
  'node tests/module-intake-batch-0.12.95.mjs',
  'node tests/module-install-guard-0.12.95.mjs',
  'node tests/role-scope-pickers-0.12.96.mjs',
  'node tests/resource-create-fields-0.12.96.mjs',
  'node tests/resources-menu-rule-0.12.96.mjs',
  'node tests/confirm-dialog-0.12.96.mjs',
  'node tests/confirm-dialog-adoption-0.12.96.mjs',
  'node tests/popup-route-prefix-0.12.96.mjs',
  'node tests/popup-optional-param-0.12.97.mjs',
  'node tests/popup-publishers-0.12.97.mjs',
  'node tests/signin-setup-wording-0.12.97.mjs',
  'node tests/system-name-0.12.97.mjs',
  'node tests/resource-create-custom-fields-0.12.97.mjs',
  'node tests/ui-design-standards-8-1-0.12.97.mjs',
  'node tests/roles-scope-retry-0.12.97.mjs',
  'node tests/context-action-confirm-abandoned-0.12.97.mjs',
  'node tests/site-move-0.12.98.mjs',
  'node tests/system-name-superuser-0.12.98.mjs',
  'node tests/revoke-all-sessions-0.12.98.mjs',
  'node tests/session-theme-0.12.98.mjs',
  'node tests/resource-create-never-blocked-0.12.98.mjs',
  'node tests/revoke-all-sessions-0.12.99.mjs',
  'node tests/site-move-follows-tactical-0.12.99.mjs',
  'node tests/resource-context-menu-0.12.99.mjs',
  'node tests/signin-step-wording-0.12.99.mjs',
  'node tests/nav-tactical-permission-0.12.99.mjs',
  'node tests/session-theme-clear-0.12.99.mjs',
  'node tests/api-keys-page-0.12.100.mjs',
  'node tests/sso-admin-page-0.12.100.mjs',
  'node tests/table-dialog-tabs-0.12.100.mjs',
  'node tests/contract-docs-0.12.100.mjs',
  'node tests/notice-toast-once-0.12.101.mjs',
  'node tests/access-panels-reload-0.12.101.mjs',
  'node tests/module-services-0.12.101.mjs',
  'node tests/header-popover-layer-0.12.101.mjs',
  'node tests/tactical-websocket-0.12.102.mjs',
  'node tests/tactical-websocket-contract-docs-0.12.102.mjs',
  'node tests/module-unload-0.12.102.mjs',
  'node tests/module-services-permissions-0.12.102.mjs',
  'node tests/signed-out-no-toast-0.12.103.mjs',
  'node tests/job-follow-0.12.103.mjs',
  'node tests/xterm-dependency-0.12.104.mjs',
  'node tests/terminal-widget-0.12.104.mjs',
  'node tests/terminal-widget-binding-0.12.104.mjs',
  'node tests/terminal-widget-contract-docs-0.12.104.mjs',
  'node tests/tactical-websocket-server-terminal-0.12.105.mjs',
  'node tests/tactical-websocket-server-terminal-docs-0.12.105.mjs',
  'node tests/tactical-ui-preferences-0.12.106.mjs',
  'node tests/tactical-ui-apply-0.12.106.mjs',
  'node tests/date-format-0.12.106.mjs',
  'node tests/module-preferences-0.12.106.mjs',
  'node tests/module-preferences-docs-0.12.106.mjs',
  'node tests/tactical-colours-always-0.12.107.mjs',
  'node tests/loading-bar-0.12.107.mjs',
  'node tests/tactical-ui-held-0.12.107.mjs',
  'node tests/loading-bar-theme-colours-0.12.108.mjs',
  'node tests/module-preferences-debounce-0.12.108.mjs',
  'node tests/core-requirement-0.12.109.mjs',
  'node tests/module-repository-skipped-0.12.109.mjs',
  'node tests/module-preferences-merged-result-0.12.109.mjs',
  'node tests/signin-parity-0.12.110.mjs',
  'bash tests/python-bin-0.12.110.sh',
  'node tests/core-requirement-0.12.116.mjs',
  'node tests/online-catalog-availability-0.12.111.mjs',
  'node tests/shared-select-tags-0.12.111.mjs',
  'node tests/shared-components-docs-0.12.111.mjs',
  'node tests/grid-columns-host-abort-0.12.111.mjs',
  'node tests/module-dialogs-0.12.112.mjs',
  'node tests/sign-in-landing-0.12.112.mjs',
  'node tests/repository-sync-schedule-0.12.112.mjs',
  'bash tests/installer-refusal-0.12.112.sh',
  'node tests/installer-refusal-view-0.12.112.mjs',
  'node tests/row-menu-0.12.112.mjs',
  'node tests/shared-select-server-search-0.12.112.mjs',
  'bash tests/installer-env-config-0.12.113.sh',
  'node tests/installer-env-config-0.12.113.mjs',
  'bash tests/csp-env-config-source-0.12.113.sh',
  'node tests/theme-tokens-0.12.114.mjs',
  'node tests/shared-kit-0.12.114.mjs',
  'node tests/shared-select-aria-0.12.114.mjs',
  'node tests/theme-docs-0.12.114.mjs',
  'node tests/sort-arrows-0.12.115.mjs',
  'bash tests/installer-header-0.12.115.sh',
  'bash tests/installer-nginx-block-0.12.115.sh',
  'bash tests/filter-editor-0.12.116.sh',
]
assert.equal(EXPECTED_0_12_116.length, 176)
assert.equal(new Set(EXPECTED_0_12_116).size, 176)

// the one replaced entry: the Core requirement test moved to its 0.12.117 version, in the same place
const expected = EXPECTED_0_12_116.map((entry) => entry.replace('core-requirement-0.12.116', 'core-requirement-0.12.117'))
assert.equal(new Set(ENTRIES).size, ENTRIES.length, 'no entry is listed twice')
assert.deepEqual(ENTRIES.slice(0, 176), expected, 'the 176 entries are all kept, in the same order, one replaced in place')
assert.deepEqual(ENTRIES.slice(176), [
  'node tests/filter-editor-date-number-0.12.117.mjs',
  'node tests/filter-editor-docs-0.12.117.mjs',
  'node tests/filter-editor-viewkey-0.12.117.mjs',
  'node tests/test-runner-0.12.117.mjs',
], 'the new tests follow')
for (const entry of ENTRIES) {
  const match = /^(bash|node) (tests\/[\w.-]+\.(?:sh|mjs))$/.exec(entry)
  assert.ok(match, `a plain entry: ${entry}`)
  assert.equal(fs.existsSync(path.join(ROOT, match[2])), true, `${match[2]} exists`)
}
assert.equal(ENTRIES.some((entry) => entry.includes('core-requirement-0.12.116')), false)
assert.equal(fs.existsSync(path.join(ROOT, 'tests/core-requirement-0.12.116.mjs')), false, 'the old requirement test is removed')

// package.json: one short command
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
assert.equal(pkg.scripts.test, 'node tests/run-all.mjs')
assert.ok(pkg.scripts.test.length < 200)

// a temporary tree: two good tests, one bad, one that must never run
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-runner-'))
const script = (name, code) => fs.writeFileSync(path.join(tmp, 'tests', `${name}.mjs`), `import fs from 'node:fs'\nfs.appendFileSync('ran.log', '${name}\\n')\n${code}\n`)
try {
  fs.mkdirSync(path.join(tmp, 'tests'))
  script('one', "console.log('one: PASS')")
  script('two', '')
  script('bad', 'process.exit(3)')
  script('never', '')
  const list = path.join(tmp, 'list.txt')
  fs.writeFileSync(list, 'node tests/one.mjs\nnode tests/two.mjs\n\nnode tests/bad.mjs\r\nnode tests/never.mjs\n')
  assert.deepEqual(loadEntries({ TT_TEST_LIST: list }), ['node tests/one.mjs', 'node tests/two.mjs', 'node tests/bad.mjs', 'node tests/never.mjs'], 'the list file replaces the list')
  assert.equal(loadEntries({}), ENTRIES)

  const lines = []
  const result = runAll(loadEntries({ TT_TEST_LIST: list }), { cwd: tmp, out: (line) => lines.push(line) })
  assert.equal(result.ok, false)
  assert.equal(result.failed, 'node tests/bad.mjs')
  assert.equal(result.ran, 3)
  assert.match(lines.join('\n'), /FAILED: node tests\/bad\.mjs/, 'the failing entry is named')
  assert.equal(fs.readFileSync(path.join(tmp, 'ran.log'), 'utf8'), 'one\ntwo\nbad\n', 'in order, and stopped at the first failure')

  // the command line: non-zero exit and the entry named
  fs.mkdirSync(path.join(tmp, 'cli', 'tests'), { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'tests', 'run-all.mjs'), path.join(tmp, 'cli', 'tests', 'run-all.mjs'))
  for (const name of ['one', 'two', 'bad', 'never']) fs.copyFileSync(path.join(tmp, 'tests', `${name}.mjs`), path.join(tmp, 'cli', 'tests', `${name}.mjs`))
  const cli = spawnSync(process.execPath, ['tests/run-all.mjs'], { cwd: path.join(tmp, 'cli'), env: { ...process.env, TT_TEST_LIST: list }, encoding: 'utf8' })
  assert.notEqual(cli.status, 0, 'a failing entry makes the runner exit non-zero')
  assert.match(cli.stdout, /FAILED: node tests\/bad\.mjs/)
  assert.match(cli.stdout, /one: PASS/, 'output of a test is shown')
  assert.equal(fs.readFileSync(path.join(tmp, 'cli', 'ran.log'), 'utf8'), 'one\ntwo\nbad\n', 'the entry after the failure never ran')

  const good = path.join(tmp, 'good.txt')
  fs.writeFileSync(good, 'node tests/one.mjs\nnode tests/two.mjs\n')
  const ok = runAll(loadEntries({ TT_TEST_LIST: good }), { cwd: tmp, out: (line) => lines.push(line) })
  assert.deepEqual({ ok: ok.ok, ran: ok.ran }, { ok: true, ran: 2 })
  assert.ok(lines.includes('All 2 test entries passed.'), 'it prints how many ran')
  const odd = runAll(['rm -rf /'], { cwd: tmp, out: (line) => lines.push(line) })
  assert.equal(odd.ok, false, 'an entry that is not bash or node tests/... is refused, not run')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
assert.equal(fs.existsSync(path.join(ROOT, 'ran.log')), false, 'nothing was left in the tree')

console.log('test-runner-0.12.117: PASS')
