import { PMTiles, Protocol } from 'pmtiles'

// Geoconnex's nightly PMTiles exports, one archive per sitemap, named after the
// sitemap id (e.g. `epa:wqp.pmtiles`). The bucket's JSON listing is public and
// CORS-enabled, so the set of layers is discovered at runtime.
const BUCKET = 'metadata-geoconnex-us'
const PREFIX = 'exports/pmtiles/'
const LISTING_URL = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`
const PUBLIC_BASE_URL = `https://storage.googleapis.com/${BUCKET}/`

export interface PmtilesExport {
  // The sitemap id the archive was exported from, e.g. `epa:wqp`.
  id: string
  url: string
}

interface ListingPage {
  items?: { name: string }[]
  nextPageToken?: string
}

export async function fetchPmtilesExports(signal: AbortSignal): Promise<PmtilesExport[]> {
  const exports: PmtilesExport[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      prefix: PREFIX,
      fields: 'items(name),nextPageToken',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const response = await fetch(`${LISTING_URL}?${params}`, { signal })
    if (!response.ok) {
      throw new Error(`PMTiles listing failed: ${response.status} ${response.statusText}`)
    }
    const page = (await response.json()) as ListingPage
    for (const item of page.items ?? []) {
      if (!item.name.endsWith('.pmtiles')) continue
      exports.push({
        id: item.name.slice(PREFIX.length, -'.pmtiles'.length),
        url: PUBLIC_BASE_URL + item.name.split('/').map(encodeURIComponent).join('/'),
      })
    }
    pageToken = page.nextPageToken
  } while (pageToken)

  exports.sort((a, b) => a.id.localeCompare(b.id))
  return exports
}

// What the map needs from an archive's tippecanoe metadata to style it.
export interface PmtilesLayerInfo {
  sourceLayer: string
  minzoom: number
  maxzoom: number
}

interface TippecanoeMetadata {
  vector_layers?: { id: string; minzoom?: number; maxzoom?: number }[]
}

// Serves `pmtiles://<url>` sources to maplibre. Archives opened here are
// registered with it, so the map reuses the header and directories already
// fetched for the layer's metadata.
export const pmtilesProtocol = new Protocol()

export function pmtilesArchive(url: string): PMTiles {
  let archive = pmtilesProtocol.get(url)
  if (!archive) {
    archive = new PMTiles(url)
    pmtilesProtocol.add(archive)
  }
  return archive
}

export async function fetchPmtilesLayerInfo(url: string): Promise<PmtilesLayerInfo> {
  const archive = pmtilesArchive(url)
  const [header, metadata] = await Promise.all([
    archive.getHeader(),
    archive.getMetadata() as Promise<TippecanoeMetadata>,
  ])
  const layer = metadata.vector_layers?.[0]
  if (!layer) throw new Error(`${url} has no vector layers`)
  return {
    sourceLayer: layer.id,
    minzoom: layer.minzoom ?? header.minZoom,
    maxzoom: layer.maxzoom ?? header.maxZoom,
  }
}

// A PMTiles export switched on in the Layers tab. Its metadata (for the
// source-layer name) loads first; the map draws it once it's ready.
export type PmtilesLayerState = { kind: 'pmtiles'; id: string; url: string } & (
  | { status: 'loading' }
  | { status: 'ready'; info: PmtilesLayerInfo }
  | { status: 'error'; error: string }
)

// The Layers tab's draw order, topmost first: the switched-on exports and the
// reference mainstem network, which is always in the stack (shown or hidden).
export const MAINSTEMS_STACK_ID = 'mainstems'
export type StackLayer = { kind: 'mainstems'; id: typeof MAINSTEMS_STACK_ID } | PmtilesLayerState

// A stack layer's look, set from its settings in the Layers tab. A null color
// keeps the layer's own (its sitemap color, or the mainstem blues).
export interface LayerStyle {
  color: string | null
  opacity: number
}

export const DEFAULT_LAYER_STYLE: LayerStyle = { color: null, opacity: 1 }
