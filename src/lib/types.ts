import type { Geometry } from 'geojson'

export interface SparqlBindingValue {
  type: 'uri' | 'literal' | 'bnode'
  value: string
  datatype?: string
  'xml:lang'?: string
}

export type SparqlBinding = Record<string, SparqlBindingValue>

export interface SparqlJsonResults {
  head: { vars: string[] }
  results: { bindings: SparqlBinding[] }
}

export interface MainstemFeatureProps {
  uri: string
  name_at_outlet: string
  lengthkm: number
  outlet_drainagearea_sqkm: number
}

export interface GraphFeature {
  id: string
  uri: string
  name?: string
  description?: string
  sitemap?: string
  geometry: Geometry
  lon: number // representative point (centroid) — used for flyTo/bounds regardless of geometry type
  lat: number
}

export type Direction = 'out' | 'in'

export interface TripleRow {
  predicate: string
  other: SparqlBindingValue
  direction: Direction
}

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error'

export interface ResourceState<T> {
  status: ResourceStatus
  data: T | null
  error: string | null
}
