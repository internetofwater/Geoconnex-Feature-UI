import type { Geometry } from 'geojson'
import type { Bbox } from './features'
import type { GraphFeature } from './types'

export function computeBounds(features: GraphFeature[]): [number, number, number, number] | null {
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

/** The [west, south, east, north] extent of a geometry's coordinates. */
export function geometryBounds(geometry: Geometry): Bbox | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (typeof value[0] === 'number') {
      const [x, y] = value as number[]
      west = Math.min(west, x)
      east = Math.max(east, x)
      south = Math.min(south, y)
      north = Math.max(north, y)
    } else value.forEach(visit)
  }
  if (geometry.type === 'GeometryCollection') {
    for (const part of geometry.geometries) {
      const bounds = geometryBounds(part)
      if (bounds) {
        visit([bounds[0], bounds[1]])
        visit([bounds[2], bounds[3]])
      }
    }
  } else visit(geometry.coordinates)
  return west === Infinity ? null : [west, south, east, north]
}
