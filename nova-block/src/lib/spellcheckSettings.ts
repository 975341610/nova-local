const SPELLCHECK_ENABLED_STORAGE_KEY = 'nova.spellcheck.enabled'

export const SPELLCHECK_SETTINGS_CHANGED_EVENT = 'nova:spellcheck-settings-changed'

export function isSpellcheckFeatureEnabled() {
  try {
    return globalThis.localStorage?.getItem(SPELLCHECK_ENABLED_STORAGE_KEY) !== 'false'
  } catch (_error) {
    return true
  }
}

export function saveSpellcheckFeatureEnabled(enabled: boolean) {
  try {
    globalThis.localStorage?.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false')
  } catch (_error) {
    // Keep editing usable even if localStorage is unavailable.
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(SPELLCHECK_SETTINGS_CHANGED_EVENT, { detail: { enabled } }))
  }
}
