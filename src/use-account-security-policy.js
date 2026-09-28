import { computed, ref, watch } from 'vue'
import { persistAccountSecurityPolicy } from './account-security-policy-save'

export function useAccountSecurityPolicy({
  getPolicy,
  updatePolicy,
  registerUnsaved,
  clearUnsaved,
  unsavedId = 'account-security-policy',
} = {}) {
  if (typeof getPolicy !== 'function') throw new TypeError('getPolicy must be a function')
  if (typeof updatePolicy !== 'function') throw new TypeError('updatePolicy must be a function')
  if (typeof registerUnsaved !== 'function') throw new TypeError('registerUnsaved must be a function')
  if (typeof clearUnsaved !== 'function') throw new TypeError('clearUnsaved must be a function')

  const loading = ref(true)
  const saving = ref(false)
  const error = ref('')
  const notice = ref('')
  const policy = ref(null)
  const canChange = ref(false)
  const requested = ref(false)
  const dirty = computed(() => Boolean(policy.value) && requested.value !== policy.value.protect_superuser_accounts)

  async function loadPolicy() {
    loading.value = true
    error.value = ''
    try {
      const response = await getPolicy()
      policy.value = response?.policy || null
      canChange.value = response?.can_change === true
      requested.value = policy.value?.protect_superuser_accounts === true
      clearUnsaved(unsavedId)
      return response
    } catch (err) {
      error.value = err?.message || 'Unable to load account security policy.'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function savePolicy() {
    if (!canChange.value || saving.value) return false
    saving.value = true
    error.value = ''
    notice.value = ''
    try {
      const response = await persistAccountSecurityPolicy(requested.value, updatePolicy)
      policy.value = response?.policy || policy.value
      requested.value = policy.value?.protect_superuser_accounts === true
      clearUnsaved(unsavedId)
      notice.value = requested.value
        ? 'Superuser account protection is enabled.'
        : 'Superuser account protection is disabled; Tactical native account-management behaviour applies.'
      return true
    } catch (err) {
      error.value = err?.message || 'Unable to update account security policy.'
      // Keep requested + dirty untouched. saveAndContinue() must observe this
      // rejection and leave its pending navigation/dialog in place.
      throw err
    } finally {
      saving.value = false
    }
  }

  const stopDirtyWatch = watch(dirty, (value) => {
    if (value) registerUnsaved(unsavedId, 'Superuser account protection policy', { save: savePolicy, discard: loadPolicy })
    else clearUnsaved(unsavedId)
  })

  function dispose() {
    stopDirtyWatch()
    clearUnsaved(unsavedId)
  }

  return {
    loading,
    saving,
    error,
    notice,
    policy,
    canChange,
    requested,
    dirty,
    loadPolicy,
    savePolicy,
    dispose,
  }
}
