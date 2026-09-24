import type { Bbox } from './features'

// Photon: an OpenStreetMap geocoder built for search-as-you-type, keyless and
// CORS-enabled. Results are biased toward the center of the US, not limited
// to it, so Alaska, Hawaii and the territories still come back.
const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/'
const US_CENTER = { lat: '39.8', lon: '-98.6' }

export interface Place {
  id: string
  name: string
  detail: string
  lon: number
  lat: number
  bbox?: Bbox
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    osm_type?: string
    osm_id?: number
    name?: string
    street?: string
    housenumber?: string
    city?: string
    county?: string
    state?: string
    country?: string
    // [west, north, east, south]
    extent?: [number, number, number, number]
  }
}

export async function geocode(query: string, signal: AbortSignal): Promise<Place[]> {
  const url = new URL(PHOTON_ENDPOINT)
  url.search = new URLSearchParams({ q: query, limit: '6', lang: 'en', ...US_CENTER }).toString()

  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Place search failed: ${response.status}`)
  const { features } = (await response.json()) as { features: PhotonFeature[] }

  return features.map((feature, index) => {
    const p = feature.properties
    const [lon, lat] = feature.geometry.coordinates
    const street = [p.housenumber, p.street].filter(Boolean).join(' ')
    const name = p.name || street || p.city || 'Unnamed place'
    const detail = [p.name ? street : '', p.city !== name ? p.city : '', p.county, p.state, p.country]
      .filter((part, i, parts) => part && parts.indexOf(part) === i)
      .join(', ')
    const extent = p.extent
    return {
      id: `${p.osm_type ?? ''}${p.osm_id ?? index}`,
      name,
      detail,
      lon,
      lat,
      bbox: extent ? [extent[0], extent[3], extent[2], extent[1]] : undefined,
    }
  })
}
