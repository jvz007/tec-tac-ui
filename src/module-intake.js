// Module intake pairing (0.12.94). Each package pairs with the .sig and .release.json that share its file name.
// Browser copy markers such as "(1)" are ignored wherever they sit, so agents-0.5.0(1).zip pairs with
// agents-0.5.0.zip(1).sig and agents-0.5.0.release(1).json. Pure functions: no network, no DOM.

const PACKAGE_EXT = /\.(zip|tgz|tar\.gz)$/
const COPY_MARK = /\(\d+\)/g

export const INTAKE_PROBLEM_INCOMPLETE = 'Needs both the .sig and the .release.json (or remove the one you added)'
export const INTAKE_PROBLEM_ORPHAN = 'No package for this signature / release file'
export const INTAKE_PROBLEM_NO_PACKAGE = 'Add at least one Tec-Tac package or bundle.'

// Says what a file is and the name it pairs under, or null for a file this helper does not pair.
export function pairingInfo(file) {
  const name = String(file?.name || '').toLowerCase().replace(COPY_MARK, '')
  if (/\.release\.json$/.test(name)) return { kind: 'metadata', key: name.replace(/\.release\.json$/, '') }
  if (/\.sig$/.test(name)) return { kind: 'signature', key: name.replace(/\.sig$/, '').replace(PACKAGE_EXT, '') }
  if (PACKAGE_EXT.test(name)) return { kind: 'package', key: name.replace(PACKAGE_EXT, '') }
  return null
}

function sidecarNames(entry) {
  return [...entry.sigs, ...entry.metas].map((file) => String(file?.name || '')).join(' + ')
}

function buildSet(entry) {
  const pkg = entry.pkgs[0] || null
  const sig = entry.sigs[0] || null
  const meta = entry.metas[0] || null
  const problems = []
  if (entry.pkgs.length > 1) problems.push('Duplicate. Two packages have this name. Remove one of them.')
  if (entry.sigs.length > 1) problems.push('Duplicate. Two .sig files have this name. Remove one of them.')
  if (entry.metas.length > 1) problems.push('Duplicate. Two .release.json files have this name. Remove one of them.')
  if (!pkg) problems.push(INTAKE_PROBLEM_ORPHAN)
  else if (Boolean(sig) !== Boolean(meta)) problems.push(INTAKE_PROBLEM_INCOMPLETE)
  const label = pkg ? String(pkg.name || '') : sidecarNames(entry)
  return { key: entry.key, label, pkg, sig, meta, problems }
}

// Groups the dropped files into sets, one per package name, in the order each name first appears.
// Returns { sets: [{ key, label, pkg, sig, meta, problems }], problems: [page-level messages] }.
// A set with no sidecars is unsigned and has no problems. A set with a package and one sidecar has a problem.
export function pairIntakeFiles(files) {
  const byKey = new Map()
  for (const file of [...(files || [])]) {
    const info = pairingInfo(file)
    if (!info) continue
    if (!byKey.has(info.key)) byKey.set(info.key, { key: info.key, pkgs: [], sigs: [], metas: [] })
    const entry = byKey.get(info.key)
    if (info.kind === 'package') entry.pkgs.push(file)
    else if (info.kind === 'signature') entry.sigs.push(file)
    else entry.metas.push(file)
  }
  const sets = [...byKey.values()].map(buildSet)
  const problems = sets.some((set) => set.pkg) ? [] : [INTAKE_PROBLEM_NO_PACKAGE]
  return { sets, problems }
}

// Orders staged groups so a group whose modules another group requires installs after it.
// Each group: { moduleIds: string[], requires: string[] }, given in upload order. Keeps upload order when
// there is no such link, and returns the upload order unchanged on a cycle (Core then refuses the plan).
export function orderGroupsByDependency(groups) {
  const list = [...(groups || [])]
  const owner = new Map()
  list.forEach((group, index) => (group.moduleIds || []).forEach((id) => owner.set(id, index)))
  const needs = list.map((group, index) => new Set((group.requires || [])
    .map((id) => owner.get(id))
    .filter((other) => other !== undefined && other !== index)))
  const done = new Set()
  const out = []
  while (out.length < list.length) {
    let next = -1
    for (let index = 0; index < list.length && next < 0; index += 1) {
      if (!done.has(index) && [...needs[index]].every((other) => done.has(other))) next = index
    }
    if (next < 0) return list
    done.add(next)
    out.push(list[next])
  }
  return out
}

// 0.12.95: a release file longer than this is not a release file. The check reads each one, so the cap keeps it small.
export const INTAKE_METADATA_MAX_BYTES = 256 * 1024

// One plain problem for a set whose release file does not match its files, or '' when it matches. Core still makes the
// same check; this one runs first so the problem is attributed to its own set and the set is never sent.
async function metadataProblem(set, readText) {
  const metaName = String(set.meta.name || 'release file')
  const pkgName = String(set.pkg.name || '')
  const sigName = String(set.sig.name || '')
  if (Number(set.meta.size) > INTAKE_METADATA_MAX_BYTES) return `${metaName} is too large to be a release file. Download it again.`
  let text
  try { text = await readText(set.meta) } catch { return `Could not read ${metaName}. Add it again.` }
  let data
  try { data = JSON.parse(String(text)) } catch { return `${metaName} is not valid JSON. Download it again.` }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return `${metaName} is not a release file. Download it again.`
  const packageFor = String(data.filename || '')
  const signatureFor = String(data.signature || '')
  if (packageFor !== pkgName) {
    return `${metaName} is for the package "${packageFor || 'unknown'}". Rename ${pkgName} back to "${packageFor || 'unknown'}" and add it again. A browser may have renamed the copy.`
  }
  if (signatureFor !== sigName) {
    return `${metaName} names the signature "${signatureFor || 'unknown'}". Rename ${sigName} back to "${signatureFor || 'unknown'}" and add it again.`
  }
  return ''
}

// Checks each set that has a package, a .sig and a .release.json before anything is sent. Returns the same list, where
// a set that fails gets one more problem. Sets with problems already, or without sidecars, are returned unchanged.
// readText(file) returns the file's text. Pure apart from that call.
export async function checkIntakeMetadata(sets, readText) {
  const out = []
  for (const set of sets || []) {
    if (!set || set.problems?.length || !set.pkg || !set.sig || !set.meta) { out.push(set); continue }
    const problem = await metadataProblem(set, readText)
    out.push(problem ? { ...set, problems: [...set.problems, problem] } : set)
  }
  return out
}
