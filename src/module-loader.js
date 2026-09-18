import * as Vue from 'vue'

function moduleIsAllowed(descriptor, context) {
  if (descriptor.allowed === false) return false
  if (!descriptor.permissions?.length) return true
  if (context.user?.superuser) return true

  // A backend-generated context can authoritatively mark the module allowed.
  // A local static manifest cannot determine Tactical role grants, so it does
  // not pretend to. Backend APIs remain authoritative for every action/data call.
  if (descriptor.allowed === true && context.source === 'backend') return true
  if (context.source !== 'backend') return true

  return descriptor.permissions.every((code) => context.permissions.includes(code))
}

export async function loadUiModules(runtime, modules) {
  const loaded = []
  const failed = []
  const skipped = []

  for (const descriptor of modules) {
    if (!moduleIsAllowed(descriptor, {
      permissions: runtime.state.context.permissions || [],
      user: runtime.state.context.user || {},
      source: runtime.state.contextSource,
    })) {
      skipped.push({ id: descriptor.id, reason: 'permission-gated' })
      continue
    }

    try {
      const imported = await import(/* @vite-ignore */ descriptor.entry)
      const plugin = imported.default || imported
      if (!plugin || typeof plugin.register !== 'function') {
        throw new Error('module does not export register(context)')
      }
      await plugin.register({ ...runtime, Vue, descriptor })
      loaded.push(descriptor.id)
    } catch (error) {
      failed.push({ id: descriptor.id, message: error?.message || String(error) })
    }
  }

  return { loaded, failed, skipped }
}
