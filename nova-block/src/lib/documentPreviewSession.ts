export const DEFAULT_DOCUMENT_PREVIEW_SESSION_CACHE_LIMIT = 8

export function limitFifoMapSize<TKey, TValue>(
  cache: Map<TKey, TValue>,
  maxEntries = DEFAULT_DOCUMENT_PREVIEW_SESSION_CACHE_LIMIT,
) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as TKey | undefined
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
}

export function getOrCreateFifoMapEntry<TKey, TValue>(
  cache: Map<TKey, TValue>,
  key: TKey,
  createEntry: () => TValue,
  maxEntries = DEFAULT_DOCUMENT_PREVIEW_SESSION_CACHE_LIMIT,
) {
  let entry = cache.get(key)
  if (!entry) {
    entry = createEntry()
    cache.set(key, entry)
    limitFifoMapSize(cache, maxEntries)
  }
  return entry
}

export const getDocumentPreviewCacheKey = (src: string, name = '', type = '') => `${src}::${name}::${type}`
