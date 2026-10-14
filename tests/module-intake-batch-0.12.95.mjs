// 0.12.95: module intake sends every clean set to Core in ONE request. Each release file is checked against its package and
// signature before anything is sent. Every package in a batch shows its own trust. The UI requires Core 1.17.20.
import assert from 'node:assert/strict'
import fs from 'node:fs'

globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'abc123' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const modulesSource = fs.readFileSync(new URL('../src/modules.js', import.meta.url), 'utf8')
  .replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
const { inspectIntakeSets, inspectModulePackages } = await import(`data:text/javascript;base64,${Buffer.from(modulesSource).toString('base64')}`)
const { pairIntakeFiles, checkIntakeMetadata, INTAKE_METADATA_MAX_BYTES } = await import('../src/module-intake.js')

const readText = (file) => file.text()
const release = (filename, signature) => new File([JSON.stringify({ filename, signature, version: '1.0.0' })], `${filename.replace(/\.zip$/, '')}.release.json`)
const pkg = (name) => new File(['zip-bytes'], name)
const sig = (name) => new File(['sig-bytes'], name)
const names = (files) => files.map((file) => file.name)

// (1) two signed sets and one unsigned package: ONE request, packages x3, signatures x2, metadata_files x2, in order.
const sent = []
globalThis.fetch = async (url, init) => {
  sent.push({ url, body: init.body })
  return new Response(JSON.stringify({ kind: 'batch', upload_id: 'batch-1', artifacts: [], packages: [], plan: { valid: true } }), { status: 201, headers: { 'content-type': 'application/json' } })
}
const alphaSet = [pkg('alpha-1.0.0.zip'), sig('alpha-1.0.0.zip.sig'), release('alpha-1.0.0.zip', 'alpha-1.0.0.zip.sig')]
const betaSet = [pkg('beta-2.0.0.zip'), sig('beta-2.0.0.zip.sig'), release('beta-2.0.0.zip', 'beta-2.0.0.zip.sig')]
const gammaPlain = [pkg('gamma-0.3.0.zip')]
const all = pairIntakeFiles([...alphaSet, ...betaSet, ...gammaPlain])
assert.deepEqual(all.problems, [])
const checked = await checkIntakeMetadata(all.sets, readText)
const results = await inspectIntakeSets(checked, inspectModulePackages)
assert.equal(sent.length, 1, 'every clean set goes in one request')
assert.match(sent[0].url, /\/api\/tfd\/modules\/v2\/packages\/inspect\/$/)
assert.deepEqual([...sent[0].body.keys()], ['packages', 'signatures', 'metadata_files', 'packages', 'signatures', 'metadata_files', 'packages'])
assert.deepEqual(sent[0].body.getAll('packages').map((file) => file.name), ['alpha-1.0.0.zip', 'beta-2.0.0.zip', 'gamma-0.3.0.zip'])
assert.deepEqual(sent[0].body.getAll('signatures').map((file) => file.name), ['alpha-1.0.0.zip.sig', 'beta-2.0.0.zip.sig'])
assert.equal(sent[0].body.getAll('metadata_files').length, 2)
assert.equal(results.length, 3)
assert.ok(results.every((result) => result.staged && result.staged === results[0].staged), 'all three share the one staged batch')
assert.equal(sent[0].body.has('signature'), false, 'the old single-signature field is not used')
assert.equal(sent[0].body.has('metadata'), false, 'the old single-metadata field is not used')

// (2) a set with a problem is never in the request, and its message stays on that set.
sent.length = 0
const orphanSet = pairIntakeFiles([pkg('good-1.0.0.zip'), pkg('lonely.zip'), sig('lonely.zip.sig')])
const orphanChecked = await checkIntakeMetadata(orphanSet.sets, readText)
const orphanResults = await inspectIntakeSets(orphanChecked, inspectModulePackages)
assert.equal(sent.length, 1)
assert.deepEqual(names(sent[0].body.getAll('packages')), ['good-1.0.0.zip'])
assert.equal(sent[0].body.getAll('signatures').length, 0)
const lonely = orphanResults.find((result) => result.set.key === 'lonely')
assert.equal(lonely.error, 'Needs both the .sig and the .release.json (or remove the one you added)')
assert.ok(!('staged' in lonely))

// (3) a browser-renamed copy: the release file names 'agents-0.5.0.zip' but the package is 'agents-0.5.0(1).zip'.
// Pairing (n)-tolerant, then the release check marks that set with a rename-back problem before anything is sent.
sent.length = 0
const renamed = pairIntakeFiles([
  pkg('agents-0.5.0(1).zip'),
  sig('agents-0.5.0.zip.sig'),
  new File([JSON.stringify({ filename: 'agents-0.5.0.zip', signature: 'agents-0.5.0.zip.sig' })], 'agents-0.5.0.release.json'),
  pkg('fine-1.0.0.zip'),
])
assert.equal(renamed.sets.length, 2)
const renamedChecked = await checkIntakeMetadata(renamed.sets, readText)
const agents = renamedChecked.find((set) => set.key === 'agents-0.5.0')
assert.equal(agents.problems.length, 1)
assert.match(agents.problems[0], /Rename agents-0\.5\.0\(1\)\.zip back to "agents-0\.5\.0\.zip" and add it again/)
const renamedResults = await inspectIntakeSets(renamedChecked, inspectModulePackages)
assert.equal(sent.length, 1, 'one request, without the renamed set')
assert.deepEqual(names(sent[0].body.getAll('packages')), ['fine-1.0.0.zip'])
assert.equal(renamedResults.find((result) => result.set.key === 'agents-0.5.0').error, agents.problems[0])

// A signature named differently from the release file is caught the same way.
const sigMismatch = pairIntakeFiles([pkg('beta-3.zip'), sig('beta-3.zip.sig'), new File([JSON.stringify({ filename: 'beta-3.zip', signature: 'beta-3.zip.sig.old' })], 'beta-3.release.json')])
const sigChecked = await checkIntakeMetadata(sigMismatch.sets, readText)
assert.match(sigChecked[0].problems[0], /names the signature "beta-3\.zip\.sig\.old"/)
assert.match(sigChecked[0].problems[0], /Rename beta-3\.zip\.sig back to "beta-3\.zip\.sig\.old"/)

// (4) an unreadable, non-JSON, non-object or oversized release file is a plain problem on its own set.
const badReads = [
  [new File(['not json'], 'x.release.json'), /is not valid JSON/],
  [new File(['[]'], 'x.release.json'), /is not a release file/],
  [new File(['"text"'], 'x.release.json'), /is not a release file/],
  [new File(['x'.repeat(INTAKE_METADATA_MAX_BYTES + 1)], 'x.release.json'), /is too large to be a release file/],
]
for (const [meta, pattern] of badReads) {
  const one = pairIntakeFiles([pkg('x.zip'), sig('x.zip.sig'), meta])
  const out = await checkIntakeMetadata(one.sets, readText)
  assert.equal(out[0].problems.length, 1)
  assert.match(out[0].problems[0], pattern)
}
const unreadable = pairIntakeFiles([pkg('y.zip'), sig('y.zip.sig'), release('y.zip', 'y.zip.sig')])
const failing = await checkIntakeMetadata(unreadable.sets, async () => { throw new Error('disk gone') })
assert.match(failing[0].problems[0], /Could not read y\.release\.json\. Add it again\./)
const sizedOut = await checkIntakeMetadata([{ key: 'z', pkg: pkg('z.zip'), sig: sig('z.zip.sig'), meta: { name: 'z.release.json', size: INTAKE_METADATA_MAX_BYTES + 1 }, problems: [] }], async () => { throw new Error('must not read a file this large') })
assert.match(sizedOut[0].problems[0], /too large/, 'an oversized file is refused by its size, before it is read')

// (5) a failing request marks every sent set with Core's text, unchanged, and sends nothing else (no per-set retry).
const calls = []
const refusing = pairIntakeFiles([pkg('p1.zip'), pkg('p2.zip'), sig('p2.zip.sig'), release('p2.zip', 'p2.zip.sig')])
const refused = await inspectIntakeSets(refusing.sets, async (files) => {
  calls.push(names(files))
  throw new Error('Core: x.zip.sig is not trusted by this server.')
})
assert.equal(calls.length, 1, 'no per-set retry after a failed request')
assert.equal(refused.length, 2)
assert.ok(refused.every((result) => result.error === 'Core: x.zip.sig is not trusted by this server.'))

// (6) a one-package signed drop still works through the same request.
const single = pairIntakeFiles([pkg('solo-1.0.0.zip'), sig('solo-1.0.0.zip.sig'), release('solo-1.0.0.zip', 'solo-1.0.0.zip.sig')])
const singleCalls = []
const singleResults = await inspectIntakeSets(single.sets, async (files) => { singleCalls.push(names(files)); return { upload_id: 'u-solo', kind: 'package' } })
assert.deepEqual(singleCalls, [['solo-1.0.0.zip', 'solo-1.0.0.zip.sig', 'solo-1.0.0.release.json']])
assert.equal(singleResults[0].staged.upload_id, 'u-solo')

// (7) stagedRowsOf on a fake batch: each row carries its own trust. A package takes its row's trust, a bundle's children take
// the trust of the bundle they came from, and only a row with neither reads NOT REPORTED.
const view = fs.readFileSync(new URL('../src/views/ModulesView.vue', import.meta.url), 'utf8')
function extractFunction(name) {
  const start = view.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `ModulesView.vue has function ${name}`)
  let depth = 0
  let end = view.indexOf('{', start)
  for (; end < view.length; end += 1) {
    if (view[end] === '{') depth += 1
    else if (view[end] === '}') { depth -= 1; if (depth === 0) break }
  }
  return view.slice(start, end + 1)
}
const { stagedRowsOf } = new Function(`${['trustLabelOf', 'trustClassOf', 'trustFieldsOf', 'planOf', 'stagedRowsOf'].map(extractFunction).join('\n')}\nreturn { stagedRowsOf }`)()
const signedTrust = { verified: true, trusted: true, state: 'verified', signed: true, publisher_display_name: 'Publisher', key_id: 'k1' }
const unsignedTrust = { state: 'unsigned', signed: false, verified: false, trusted: false }
const bundleTrust = { verified: true, trusted: true, state: 'verified', signed: true }
const batch = {
  kind: 'batch',
  upload_id: 'batch-1',
  artifacts: [
    { upload_id: 'up-alpha', kind: 'package', filename: 'alpha.zip', sha256: 'a'.repeat(64), publisher_trust: signedTrust },
    { upload_id: 'up-beta', kind: 'package', filename: 'beta.zip', sha256: 'b'.repeat(64), publisher_trust: unsignedTrust },
    { upload_id: 'up-pack', kind: 'bundle', filename: 'pack.zip', sha256: 'c'.repeat(64), publisher_trust: bundleTrust },
  ],
  packages: [
    { id: 'alpha', source_upload_id: 'up-alpha', source_kind: 'package', source_filename: 'alpha.zip', publisher_trust: signedTrust, preview: { id: 'alpha', extension_version: '1.0.0' } },
    { id: 'beta', source_upload_id: 'up-beta', source_kind: 'package', source_filename: 'beta.zip', publisher_trust: unsignedTrust, preview: { id: 'beta', extension_version: '2.0.0' } },
    { id: 'child-one', source_upload_id: 'up-pack', source_kind: 'bundle', source_bundle_id: 'pack', source_filename: 'pack.zip', preview: { id: 'child-one', extension_version: '1.0.0' } },
    { id: 'child-two', source_upload_id: 'up-pack', source_kind: 'bundle', source_bundle_id: 'pack', source_filename: 'pack.zip', preview: { id: 'child-two', extension_version: '1.0.0' } },
    { id: 'orphan', source_upload_id: 'up-missing', source_kind: 'package', source_filename: 'orphan.zip', preview: { id: 'orphan', extension_version: '1.0.0' } },
  ],
  plan: { valid: true, actions: [{ id: 'alpha', action: 'install' }, { id: 'beta', action: 'replace' }] },
}
const rows = Object.fromEntries(stagedRowsOf(batch).map((row) => [row.id, row]))
assert.equal(rows.alpha.intake_trust_label, 'VERIFIED')
assert.equal(rows.alpha.intake_trust_class, 'ok')
assert.equal(rows.beta.intake_trust_label, 'UNSIGNED')
assert.equal(rows.beta.intake_trust_class, '')
assert.equal(rows['child-one'].intake_trust_label, 'VERIFIED', 'a bundle child takes its bundle trust')
assert.equal(rows['child-two'].intake_trust_label, 'VERIFIED')
assert.equal(rows.orphan.intake_trust_label, 'NOT REPORTED', 'only a row with no trust at all reads NOT REPORTED')
assert.notEqual(rows.alpha.intake_trust_label, rows.beta.intake_trust_label, 'each row keeps its own badge')
assert.equal(rows.alpha.action, 'install', 'the plan action still joins its row')
assert.equal(rows.beta.action, 'replace')
assert.equal(rows.alpha.intake_filename, 'alpha.zip')
assert.equal(rows['child-one'].intake_source, 'bundle · pack')

// A single package and a bundle keep their payload-level trust.
const single1 = stagedRowsOf({ kind: 'package', filename: 'solo.zip', publisher_trust: unsignedTrust, preview: { id: 'solo', plan: { valid: true } } })
assert.equal(single1[0].intake_trust_label, 'UNSIGNED')
const bundled = stagedRowsOf({ kind: 'bundle', filename: 'pack.zip', publisher_trust: signedTrust, preview: { kind: 'bundle', id: 'pack', packages: [{ id: 'one' }, { id: 'two' }] } })
assert.deepEqual(bundled.map((row) => row.intake_trust_label), ['VERIFIED', 'VERIFIED'])

// (8) the requirement and the version.
const pkgJson = JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url), 'utf8'))
assert.equal(pkgJson.requires['tec-tac-framework'], '>=1.17.34,<2.0.0', 'batch intake needs Core 1.17.20')
assert.equal(pkgJson.version, fs.readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim())

console.log('module-intake-batch-0.12.95: ok')
