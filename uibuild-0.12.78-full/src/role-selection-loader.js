export async function loadLatestRoleSelection({ id, getRole, getExtensionPermissions, requestGate }) {
  const requestId = requestGate.begin()
  try {
    const role = await getRole(id)
    let extensions = []
    let permissions = {}
    try {
      const ext = await getExtensionPermissions(id)
      extensions = ext?.extensions || []
      permissions = { ...(ext?.permissions || {}) }
    } catch (error) {
      if (error?.status !== 404 && error?.status !== 403) throw error
    }
    if (!requestGate.isCurrent(requestId)) return { stale: true }
    return { stale: false, role, extensions, permissions }
  } catch (error) {
    if (!requestGate.isCurrent(requestId)) return { stale: true }
    throw error
  }
}
