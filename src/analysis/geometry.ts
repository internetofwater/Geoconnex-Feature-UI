import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { LngLat } from '../lib/riverRunner'

const EARTH_RADIUS_KM = 6371
const MERCATOR_RADIUS_M = 6378137

export function distanceKm([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const dφ = toRad(lat2 - lat1)
  const dλ = toRad(lon2 - lon1)
  const a =
    Math.sin(dφ / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dλ / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function lineLengthKm(coords: LngLat[]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) total += distanceKm(coords[i - 1], coords[i])
  return total
}

// --- Web Mercator, for handing whitebox a CRS whose units are metres -------

function toMercator([lon, lat]: LngLat): LngLat {
  return [
    MERCATOR_RADIUS_M * toRad(lon),
    MERCATOR_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2)),
  ]
}

function mapCoords(geometry: Geometry, fn: (c: LngLat) => LngLat): Geometry {
  switch (geometry.type) {
    case 'Point':
      return { ...geometry, coordinates: fn(geometry.coordinates as LngLat) }
    case 'MultiPoint':
    case 'LineString':
      return { ...geometry, coordinates: (geometry.coordinates as LngLat[]).map(fn) }
    case 'MultiLineString':
    case 'Polygon':
      return {
        ...geometry,
        coordinates: (geometry.coordinates as LngLat[][]).map((r) => r.map(fn)),
      }
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: (geometry.coordinates as LngLat[][][]).map((p) => p.map((r) => r.map(fn))),
      }
    default:
      return geometry
  }
}

/** The collection in EPSG:3857, tagged with a `crs` member whitebox reads. */
export function toMercatorCollection(features: Feature[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    // Non-standard since RFC 7946, but it's how whitebox learns the CRS.
    ...({ crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3857' } } } as object),
    features: features.map((f) => ({ ...f, geometry: mapCoords(f.geometry, toMercator) })),
  }
}

/**
 * Web Mercator stretches distances by 1 / cos(latitude), so a real distance
 * becomes this many Mercator metres at the given latitude.
 */
export function mercatorMetres(km: number, latitude: number): number {
  return (km * 1000) / Math.cos(toRad(latitude))
}

// --- Positions along a line ------------------------------------------------

export interface LinePosition {
  // km from the start of the line (the headwater, for flowlines)
  along: number
  // km from the point to the line
  offset: number
}

/** Snaps a point onto a polyline, measuring along it from its first vertex. */
export function locateOnLine(point: LngLat, coords: LngLat[]): LinePosition {
  // Equirectangular projection around the point: accurate at the few-km scale
  // that matters when picking the nearest segment.
  const kx = EARTH_RADIUS_KM * toRad(1) * Math.cos(toRad(point[1]))
  const ky = EARTH_RADIUS_KM * toRad(1)
  let best: LinePosition = { along: 0, offset: Infinity }
  let travelled = 0
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1]
    const [x1, y1] = coords[i]
    const ax = (x0 - point[0]) * kx
    const ay = (y0 - point[1]) * ky
    const dx = (x1 - x0) * kx
    const dy = (y1 - y0) * ky
    const segment = Math.hypot(dx, dy)
    const t = segment ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / segment ** 2)) : 0
    const offset = Math.hypot(ax + t * dx, ay + t * dy)
    if (offset < best.offset) best = { along: travelled + t * segment, offset }
    travelled += segment
  }
  return best
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
