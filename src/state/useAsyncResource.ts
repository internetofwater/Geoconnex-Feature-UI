import { useEffect, useRef, useState } from 'react'
import type { ResourceState } from '../lib/types'

export function useAsyncResource<T>(
  key: string | null,
  fetcher: (key: string, signal: AbortSignal) => Promise<T>,
): ResourceState<T> {
  const cache = useRef(new Map<string, T>())
  const [state, setState] = useState<ResourceState<T>>({
    status: 'idle',
    data: null,
    error: null,
  })
  const [trackedKey, setTrackedKey] = useState(key)

  // React only runs the effect below *after* this render commits, so without this,
  // a component switching from one key to another (e.g. a different mainstem)
  // would paint one frame with the new key's UI still wearing the previous key's
  // stale data. Resetting synchronously during render — React's documented
  // pattern for "adjust state when a prop changes" — closes that gap. A cache
  // hit briefly passes through 'loading' until the effect below resolves it;
  // that's cheaper than reading the ref (an external cache) during render.
  if (key !== trackedKey) {
    setTrackedKey(key)
    setState({ status: key ? 'loading' : 'idle', data: null, error: null })
  }

  useEffect(() => {
    if (!key) return

    const cached = cache.current.get(key)
    if (cached) {
      setState({ status: 'success', data: cached, error: null })
      return
    }

    const controller = new AbortController()

    fetcher(key, controller.signal)
      .then((data) => {
        cache.current.set(key, data)
        setState({ status: 'success', data, error: null })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'Request failed',
        })
      })

    return () => controller.abort()
    // Intentionally keyed only on `key` — `fetcher` is a stable module-level function at
    // every call site, and re-running on its identity would defeat the cache above.
  }, [key])

  return state
}
