// 0.12.94: module intake pairs each package with the .sig and .release.json that share its name.
// 0.12.95: every clean set goes to Core in one request (the request shape is pinned in the 0.12.94 section below).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { moduleManagerSource } from './helpers/module-manager-source.mjs'

globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'abc123' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const modulesSource = fs.readFileSync(new URL('../src/modules.js', import.meta.url), 'utf8')
  .replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
const { inspectIntakeSets, inspectModulePackages } = await import(`data:text/javascript;base64,${Buffer.from(modulesSource).toString('base64')}`)
const { pairIntakeFiles, orderGroupsByDependency, INTAKE_PROBLEM_INCOMPLETE, INTAKE_PROBLEM_ORPHAN } = await import('../src/module-intake.js')

const stub = (name) => ({ name, size: 10, lastModified: 1 })
const names = (set) => ({ pkg: set.pkg?.name ?? null, sig: set.sig?.name ?? null, meta: set.meta?.name ?? null })
const byKey = (result, key) => result.sets.find((set) => set.key === key)

// (1) three packages, three signatures and three release files, shuffled, pair by name.
const shuffled = pairIntakeFiles([
  stub('beta-1.0.0.release.json'), stub('gamma-0.1.0.tar.gz.sig'), stub('alpha-2.0.0.tgz'),
  stub('gamma-0.1.0.tar.gz'), stub('beta-1.0.0.zip.sig'), stub('alpha-2.0.0.tgz.sig'),
  stub('alpha-2.0.0.release.json'), stub('beta-1.0.0.zip'), stub('gamma-0.1.0.release.json'),
])
assert.equal(shuffled.sets.length, 3)
assert.deepEqual(shuffled.problems, [])
assert.deepEqual(names(byKey(shuffled, 'alpha-2.0.0')), { pkg: 'alpha-2.0.0.tgz', sig: 'alpha-2.0.0.tgz.sig', meta: 'alpha-2.0.0.release.json' })
assert.deepEqual(names(byKey(shuffled, 'beta-1.0.0')), { pkg: 'beta-1.0.0.zip', sig: 'beta-1.0.0.zip.sig', meta: 'beta-1.0.0.release.json' })
assert.deepEqual(names(byKey(shuffled, 'gamma-0.1.0')), { pkg: 'gamma-0.1.0.tar.gz', sig: 'gamma-0.1.0.tar.gz.sig', meta: 'gamma-0.1.0.release.json' })
for (const set of shuffled.sets) assert.deepEqual(set.problems, [], set.key)

// (2) browser copy markers wherever they sit.
const copies = pairIntakeFiles([stub('agents-0.5.0(1).zip'), stub('agents-0.5.0.zip(1).sig'), stub('agents-0.5.0.release(1).json')])
assert.equal(copies.sets.length, 1)
assert.deepEqual(names(copies.sets[0]), { pkg: 'agents-0.5.0(1).zip', sig: 'agents-0.5.0.zip(1).sig', meta: 'agents-0.5.0.release(1).json' })
assert.deepEqual(copies.sets[0].problems, [])

// (3) .tar.gz and .tgz packages pair, and a copy marker inside .tar(1).gz is ignored.
const archives = pairIntakeFiles([
  stub('x.tar.gz'), stub('x.tar.gz.sig'), stub('x.release.json'),
  stub('y.tgz'), stub('y.tgz.sig'), stub('y.release.json'),
  stub('z.tar(1).gz'), stub('z.tar.gz.sig'), stub('z.release.json'),
])
assert.equal(archives.sets.length, 3)
for (const set of archives.sets) assert.deepEqual(set.problems, [], set.key)
assert.equal(byKey(archives, 'y').pkg.name, 'y.tgz')
assert.equal(byKey(archives, 'z').pkg.name, 'z.tar(1).gz')

// (4) a package with no sidecars is an unsigned set with no problem.
const unsigned = pairIntakeFiles([stub('solo.zip')])
assert.deepEqual(names(unsigned.sets[0]), { pkg: 'solo.zip', sig: null, meta: null })
assert.deepEqual(unsigned.sets[0].problems, [])
assert.deepEqual(unsigned.problems, [])

// (5) a package with only its signature gets a problem for that set only; the other set stays clean.
const partial = pairIntakeFiles([stub('bad.zip'), stub('bad.zip.sig'), stub('good.zip'), stub('good.zip.sig'), stub('good.release.json')])
assert.deepEqual(byKey(partial, 'bad').problems, ['Needs both the .sig and the .release.json (or remove the one you added)'])
assert.equal(INTAKE_PROBLEM_INCOMPLETE, 'Needs both the .sig and the .release.json (or remove the one you added)')
assert.deepEqual(byKey(partial, 'good').problems, [])

// (6) orphan signature and release file are reported; the message names no package.
const orphans = pairIntakeFiles([stub('other.zip'), stub('lonely.zip.sig'), stub('lonely.release.json')])
const lonely = byKey(orphans, 'lonely')
assert.equal(lonely.pkg, null)
assert.deepEqual(lonely.problems, [INTAKE_PROBLEM_ORPHAN])
assert.equal(INTAKE_PROBLEM_ORPHAN, 'No package for this signature / release file')
assert.deepEqual(byKey(orphans, 'other').problems, [])

// (7) duplicate package names and duplicate sidecars are flagged on their own set.
const dupes = pairIntakeFiles([
  stub('dup.zip'), stub('dup(1).zip'),
  stub('dup2.zip'), stub('dup2.zip.sig'), stub('dup2.zip(1).sig'), stub('dup2.release.json'),
  stub('fine.zip'), stub('fine.zip.sig'), stub('fine.release.json'),
])
assert.equal(byKey(dupes, 'dup').problems.length, 1)
assert.match(byKey(dupes, 'dup').problems[0], /^Duplicate\./)
assert.equal(byKey(dupes, 'dup2').problems.length, 1)
assert.match(byKey(dupes, 'dup2').problems[0], /^Duplicate\./)
assert.deepEqual(byKey(dupes, 'fine').problems, [])

// (8) names are compared case-insensitively; no package at all is the page-level message.
const caps = pairIntakeFiles([stub('Alpha.ZIP'), stub('alpha.zip.SIG'), stub('ALPHA.release.JSON')])
assert.equal(caps.sets.length, 1)
assert.deepEqual(caps.sets[0].problems, [])
assert.deepEqual(pairIntakeFiles([stub('only.sig')]).problems, ['Add at least one Tec-Tac package or bundle.'])

// (9) the old page-level refusal is gone from the source.
const srcFiles = fs.readdirSync(new URL('../src/', import.meta.url), { recursive: true })
  .filter((name) => /\.(js|vue)$/.test(name))
for (const name of srcFiles) {
  const text = fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
  assert.ok(!text.includes('Only one detached signature can accompany an uploaded package.'), name)
  assert.ok(!text.includes('Only one release metadata file can accompany'), name)
}

// (10) inspectIntakeSets (0.12.95): every clean set goes in ONE request; a set with a problem is never sent. A failed
// request marks each sent set with Core's text and sends nothing else (no per-set retry).
const sets = pairIntakeFiles([
  stub('u1.zip'), stub('s1.zip'), stub('s1.zip.sig'), stub('s1.release.json'),
  stub('u2.zip'), stub('bad.zip'), stub('bad.zip.sig'), stub('bad.release.json'),
  stub('half.zip'), stub('half.zip.sig'),
]).sets
const calls = []
const post = async (files) => {
  calls.push(files.map((file) => file.name))
  if (files.some((file) => file.name === 'bad.zip')) throw new Error('Core refused this signature.')
  return { upload_id: `upload-${calls.length}` }
}
const results = await inspectIntakeSets(sets, post)
assert.deepEqual(calls, [[
  'u1.zip', 's1.zip', 's1.zip.sig', 's1.release.json',
  'u2.zip', 'bad.zip', 'bad.zip.sig', 'bad.release.json',
]])
assert.equal(results.length, sets.length)
assert.deepEqual(results.map((result) => result.set.key), sets.map((set) => set.key))
const [u1, s1, u2, bad, half] = results
assert.equal(u1.error, 'Core refused this signature.')
assert.equal(s1.error, 'Core refused this signature.')
assert.equal(u2.error, 'Core refused this signature.')
assert.equal(bad.error, 'Core refused this signature.')
assert.ok(!('staged' in bad))
assert.match(half.error, /^Needs both/)
assert.equal(calls.some((call) => call.includes('half.zip')), false, 'a set with a problem is never sent')
const okSets = sets.filter((set) => set.key === 'u1' || set.key === 'u2' || set.key === 's1')
const okCalls = []
const okResults = await inspectIntakeSets(okSets, async (files) => { okCalls.push(files.length); return { upload_id: 'batch-1', kind: 'batch' } })
assert.deepEqual(okCalls, [5], 'one request carries every set (u1: 1 file, s1: 3 files, u2: 1 file)')
assert.ok(okResults.every((result) => result.staged === okResults[0].staged), 'sets sent together share one staged payload')
assert.equal(okResults[0].staged.upload_id, 'batch-1')

// (11) the real request (0.12.95): every file in one request, as repeated fields. Packages, signatures and release files
// each keep their own field name, in upload order.
const sent = []
globalThis.fetch = async (url, init) => {
  sent.push({ url, body: init.body })
  return new Response(JSON.stringify({ upload_id: `u${sent.length}` }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const signed = pairIntakeFiles([new File(['p'], 'agents-0.5.0.zip'), new File(['s'], 'agents-0.5.0.zip.sig'), new File(['m'], 'agents-0.5.0.release.json')]).sets
const pair = [new File(['a'], 'a.zip'), new File(['b'], 'b.zip')]
await inspectIntakeSets([...signed, ...pairIntakeFiles(pair).sets], inspectModulePackages)
assert.equal(sent.length, 1)
assert.match(sent[0].url, /\/api\/tfd\/modules\/v2\/packages\/inspect\/$/)
assert.deepEqual([...sent[0].body.keys()], ['packages', 'signatures', 'metadata_files', 'packages', 'packages'])
assert.equal(sent[0].body.getAll('packages')[0].name, 'agents-0.5.0.zip')
assert.equal(sent[0].body.getAll('signatures')[0].name, 'agents-0.5.0.zip.sig')
assert.equal(sent[0].body.getAll('metadata_files')[0].name, 'agents-0.5.0.release.json')

// (12) install order: a group whose modules another group requires installs after it; a cycle keeps upload order.
const ordered = orderGroupsByDependency([
  { key: 'app', moduleIds: ['app'], requires: ['lib'] },
  { key: 'lib', moduleIds: ['lib'], requires: [] },
])
assert.deepEqual(ordered.map((group) => group.key), ['lib', 'app'])
const independent = orderGroupsByDependency([{ key: 'a', moduleIds: ['a'], requires: [] }, { key: 'b', moduleIds: ['b'], requires: [] }])
assert.deepEqual(independent.map((group) => group.key), ['a', 'b'])
const cycle = orderGroupsByDependency([
  { key: 'a', moduleIds: ['a'], requires: ['b'] },
  { key: 'b', moduleIds: ['b'], requires: ['a'] },
])
assert.deepEqual(cycle.map((group) => group.key), ['a', 'b'])

// (13) ModulesView wiring: no page-level signature refusal, the poll waits for queued sets, discard covers every upload.
const view = moduleManagerSource()
assert.match(view, /const pendingIntakeProblem = computed\(\(\) => pendingSets\.value\.problems\[0\] \|\| ''\)/)
assert.doesNotMatch(view, /intake\.signatures\.length > 1/)
assert.match(view, /const checked = await checkIntakeMetadata\(pendingSets\.value\.sets, \(file\) => file\.text\(\)\)/)
assert.match(view, /const results = await inspectIntakeSets\(checked, post\)/)
const pollBody = view.slice(view.indexOf('async function poll()'), view.indexOf('function reloadTecTac'))
// The reload comes only after the queued-set check, so a queued set never reloads the page early.
assert.match(pollBody, /if \(stagedGroups\(\)\.length\) \{\s*await runInstall\(confirmedDisable\.value, false, true\)\s*return\s*\}[\s\S]*?scheduleReload\(\)/)
assert.equal((pollBody.match(/scheduleReload\(\)/g) || []).length, 1)
const clearBody = view.slice(view.indexOf('async function clearStaged()'), view.indexOf('async function install()'))
assert.match(clearBody, /const uploadIds = stagedGroups\(\)\.map\(\(group\) => group\.staged\?\.upload_id\)\.filter\(Boolean\)/)
assert.match(clearBody, /for \(const uploadId of uploadIds\) \{\s*try \{ await discardModuleArtifact\(uploadId\) \}/)
const installBody = view.slice(view.indexOf('async function runInstall('), view.indexOf('// The message when a set did not install'))
assert.match(installBody, /installModuleArtifact\(\n\s*group\.staged\.upload_id,\n\s*kindOf\(group\.staged\),\n\s*order,\n\s*sendIds,\n(?:\s*\/\/[^\n]*\n)?\s*\.\.\.\(typeof licenceReason === 'string' \? \[licenceReason\] : \[\]\),\n\s*\)/)
// 0.12.118: the call is still group, kind, order and sendIds; the licence reason is added last and only when there is one.

console.log('module-intake-sets-0.12.94: ok')
