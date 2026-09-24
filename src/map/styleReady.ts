import type { Map as MaplibreMap } from 'maplibre-gl'

/**
 * Runs `apply` now, or once the style finishes loading if a basemap switch is
 * still in flight. `map.isStyleLoaded()` can't be used to decide: it's also false
 * whenever tiles are still loading, and then `style.load` never comes. `apply`
 * must be idempotent (check getSource/getLayer before adding), since a throw
 * partway through is retried in full. Returns a cleanup that cancels the wait.
 */
export function whenStyleReady(map: MaplibreMap, apply: () => void): () => void {
  try {
    apply()
    return () => {}
  } catch {
    map.once('style.load', apply)
    return () => {
      map.off('style.load', apply)
    }
  }
}
