import type { GraphFeature } from './types'

export function computeBounds(
  features: GraphFeature[],
): [number, number, number, number] | null {
  if (features.length === 0) return null

  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity

  for (const feature of features) {
    minLon = Math.min(minLon, feature.lon)
    minLat = Math.min(minLat, feature.lat)
    maxLon = Math.max(maxLon, feature.lon)
    maxLat = Math.max(maxLat, feature.lat)
  }

  return [minLon, minLat, maxLon, maxLat]
}
