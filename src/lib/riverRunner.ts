import type { MainstemFeatureProps } from './types'

export type LngLat = [number, number]

export interface RunnerLeg {
  uri: string
  name: string
  // Enough to select this mainstem in the explorer as the runner reaches it.
  mainstem: MainstemFeatureProps
  // Head → outlet, i.e. in the direction of flow.
  coords: LngLat[]
  // Cumulative distance (km) at each vertex; last entry is the leg's length.
  cumulative: number[]
  downstream: string | null
  // Every mainstem below this one, nearest first, down to the terminus.
  downstreamChain: string[]
}

const MAINSTEMS_ITEMS = 'https://reference.geoconnex.us/collections/mainstems/items'

interface RawMainstem {
  features?: {
    properties?: {
      name_at_outlet?: string
      downstream_mainstem_id?: string
      // A Python-style list literal: "['https://…', 'https://…']".
      encompassing_mainstem_basins?: string
      lengthkm?: number
      outlet_drainagearea_sqkm?: number
    }
    geometry?: { type: string; coordinates: unknown } | null
  }[]
}

/**
 * Fetches one mainstem's flowline and downstream link. Queries the collection by
 * `uri` rather than resolving the PID to its item page: the item embeds every
 * linked dataset (hundreds of KB for a big river), while `properties=` trims the
 * collection response down to the geometry and the two fields needed here.
 */
export async function fetchRunnerLeg(uri: string, signal: AbortSignal): Promise<RunnerLeg> {
  const url = new URL(MAINSTEMS_ITEMS)
  url.search = new URLSearchParams({
    uri,
    properties:
      'name_at_outlet,downstream_mainstem_id,lengthkm,outlet_drainagearea_sqkm,encompassing_mainstem_basins',
    f: 'json',
  }).toString()

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Mainstem lookup failed: ${response.status} ${response.statusText}`)
  }
  const feature = ((await response.json()) as RawMainstem).features?.[0]
  const geometry = feature?.geometry
  if (!geometry) throw new Error(`No geometry found for ${uri}`)

  let coords: LngLat[]
  if (geometry.type === 'LineString') coords = geometry.coordinates as LngLat[]
  else if (geometry.type === 'MultiLineString') coords = (geometry.coordinates as LngLat[][]).flat()
  else throw new Error(`Unexpected ${geometry.type} geometry for ${uri}`)

  const props = feature.properties ?? {}
  return {
    uri,
    name: props.name_at_outlet || 'Unnamed river',
    mainstem: {
      uri,
      name_at_outlet: props.name_at_outlet ?? '',
      lengthkm: props.lengthkm ?? 0,
      outlet_drainagearea_sqkm: props.outlet_drainagearea_sqkm ?? 0,
    },
    coords,
    cumulative: cumulativeDistances(coords),
    downstream: props.downstream_mainstem_id || null,
    downstreamChain: props.encompassing_mainstem_basins?.match(/https?:\/\/[^'",\]\s]+/g) ?? [],
  }
}

/**
 * A tributary joins its downstream mainstem partway along it, so the next leg
 * starts at the vertex nearest to where the previous one ended.
 */
export function trimToJoin(leg: RunnerLeg, joinAt: LngLat): RunnerLeg {
  let nearest = 0
  let best = Infinity
  leg.coords.forEach((coord, index) => {
    const d = distanceKm(coord, joinAt)
    if (d < best) {
      best = d
      nearest = index
    }
  })
  const coords = leg.coords.slice(nearest)
  if (coords.length < 2) coords.unshift(joinAt)
  return { ...leg, coords, cumulative: cumulativeDistances(coords) }
}

export function legLength(leg: RunnerLeg): number {
  return leg.cumulative[leg.cumulative.length - 1] ?? 0
}

/** The point `distance` km along the leg, clamped to its ends. */
export function pointAlong(leg: RunnerLeg, distance: number): LngLat {
  const { coords, cumulative } = leg
  if (distance <= 0) return coords[0]
  if (distance >= legLength(leg)) return coords[coords.length - 1]
  // Binary search for the segment containing `distance`.
  let lo = 0
  let hi = cumulative.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid] <= distance) lo = mid
    else hi = mid
  }
  const span = cumulative[hi] - cumulative[lo] || 1
  const t = (distance - cumulative[lo]) / span
  const [x0, y0] = coords[lo]
  const [x1, y1] = coords[hi]
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]
}

/**
 * The average position over [distance - radius, distance + radius]. Flowlines
 * are made of straight segments with sharp corners; averaging along them gives
 * the camera a path that rounds those corners off instead of snapping at each.
 */
export function smoothedPointAlong(
  leg: RunnerLeg,
  distance: number,
  radius: number,
  samples = 9,
): LngLat {
  let lon = 0
  let lat = 0
  for (let i = 0; i < samples; i++) {
    const [x, y] = pointAlong(leg, distance - radius + (2 * radius * i) / (samples - 1))
    lon += x
    lat += y
  }
  return [lon / samples, lat / samples]
}

/** Initial compass bearing (degrees) from `a` to `b`. */
export function bearingDeg([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180) / Math.PI
}

function cumulativeDistances(coords: LngLat[]): number[] {
  const out = [0]
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + distanceKm(coords[i - 1], coords[i]))
  return out
}

function distanceKm([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const dφ = toRad(lat2 - lat1)
  const dλ = toRad(lon2 - lon1)
  const a =
    Math.sin(dφ / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dλ / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
