import type { Geometry } from 'geojson'
import type { GraphFeature } from './types'

export const FEATURES_COLLECTION_URL = 'https://features.geoconnex.us/collections/GeoconnexFeatures'
const FEATURES_ENDPOINT = `${FEATURES_COLLECTION_URL}/items`

interface RawFeatureCollection {
  features: RawFeature[]
}

interface RawFeature {
  properties?: Record<string, unknown>
  geometry?: Geometry | null
}

// Features without a geoconnex_sitemap are grouped under the empty string.
export function sitemapKey(feature: GraphFeature): string {
  return feature.sitemap ?? ''
}

export async function fetchMainstemFeatures(
  mainstemUri: string,
  signal: AbortSignal,
): Promise<GraphFeature[]> {
  const params = new URLSearchParams({ mainstem_uri: mainstemUri, limit: '2000', f: 'json' })
  return fetchFeatureCollection(params, signal)
}

// Requests started ahead of time (the river runner fetches the next river's
// features before it arrives), so selecting that mainstem can reuse them. Kept
// small: the runner only ever looks one river ahead.
const PREFETCH_LIMIT = 3
const prefetchedMainstems = new Map<string, Promise<GraphFeature[]>>()

export function prefetchMainstemFeatures(mainstemUri: string): void {
  if (prefetchedMainstems.has(mainstemUri)) return
  const request = fetchMainstemFeatures(mainstemUri, new AbortController().signal)
  request.catch(() => prefetchedMainstems.delete(mainstemUri))
  prefetchedMainstems.set(mainstemUri, request)
  const oldest = prefetchedMainstems.keys().next().value
  if (prefetchedMainstems.size > PREFETCH_LIMIT && oldest) prefetchedMainstems.delete(oldest)
}

/** fetchMainstemFeatures, reusing a prefetched request when there is one. */
export function loadMainstemFeatures(
  mainstemUri: string,
  signal: AbortSignal,
): Promise<GraphFeature[]> {
  const request = prefetchedMainstems.get(mainstemUri)
  if (!request) return fetchMainstemFeatures(mainstemUri, signal)
  // The shared request can't be cancelled, but the caller's abort must still
  // reject like a real fetch would so it never resolves into a stale view.
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    request.then(resolve, reject)
  })
}

export type Bbox = [number, number, number, number]

export interface FeatureSearchParams {
  term: string
  sitemapId?: string
  bbox?: Bbox
}

// Distinguishes an empty/never-run search from a search that legitimately found
// nothing, so callers keyed on this string see a stable identity per query.
export function searchResourceKey({ term, sitemapId, bbox }: FeatureSearchParams): string | null {
  const trimmed = term.trim()
  if (!trimmed) return null
  return JSON.stringify([trimmed, sitemapId ?? null, bbox ?? null])
}

export async function searchFeatures(key: string, signal: AbortSignal): Promise<GraphFeature[]> {
  const [term, sitemapId, bbox] = JSON.parse(key) as [string, string | null, Bbox | null]

  const clauses = [`feature_name ILIKE '%${escapeCql2String(term)}%'`]
  if (sitemapId) {
    // ILIKE + wildcards rather than `=` — features harvested via bulk integrations
    // often carry a `bulk:` prefix on geoconnex_sitemap that the sitemap.xml
    // `sitemap_id` (the value users pick from) doesn't include.
    clauses.push(`geoconnex_sitemap ILIKE '%${escapeCql2String(sitemapId)}%'`)
  }
  if (bbox) {
    // The OGC `bbox` query param is an intersects test (a feature straddling the
    // edge still matches). A CQL2 WITHIN predicate against a WKT polygon gives
    // strict containment instead.
    clauses.push(`WITHIN(geometry, ${bboxToWktPolygon(bbox)})`)
  }

  const params = new URLSearchParams({
    filter: clauses.join(' AND '),
    limit: '200',
    f: 'json',
  })
  return fetchFeatureCollection(params, signal)
}

function bboxToWktPolygon([west, south, east, north]: Bbox): string {
  return `POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))`
}

function escapeCql2String(value: string): string {
  return value.replace(/'/g, "''")
}

async function fetchFeatureCollection(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<GraphFeature[]> {
  const url = new URL(FEATURES_ENDPOINT)
  url.search = params.toString()

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Feature query failed: ${response.status} ${response.statusText}`)
  }

  const collection = (await response.json()) as RawFeatureCollection
  const features: GraphFeature[] = []
  for (const raw of collection.features ?? []) {
    const feature = toGraphFeature(raw)
    if (feature) features.push(feature)
  }
  return features
}

function toGraphFeature(raw: RawFeature): GraphFeature | null {
  const props = raw.properties ?? {}
  const uri = asString(props.id)
  const point = centroid(raw.geometry)
  if (!uri || !point || !raw.geometry) return null

  return {
    id: uri,
    uri,
    name: asString(props.feature_name),
    description: asString(props.feature_description),
    sitemap: asString(props.geoconnex_sitemap),
    geometry: raw.geometry,
    lon: point[0],
    lat: point[1],
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function centroid(geometry: RawFeature['geometry']): [number, number] | null {
  if (!geometry || geometry.type === 'GeometryCollection') return null
  const coords: [number, number][] = []
  collectCoordinates(geometry.coordinates, coords)
  if (coords.length === 0) return null
  const lon = coords.reduce((sum, [x]) => sum + x, 0) / coords.length
  const lat = coords.reduce((sum, [, y]) => sum + y, 0) / coords.length
  return [lon, lat]
}

function collectCoordinates(value: unknown, out: [number, number][]): void {
  if (!Array.isArray(value)) return
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    out.push([value[0] as number, value[1] as number])
    return
  }
  for (const item of value) collectCoordinates(item, out)
}
