import type { Feature, FeatureCollection } from 'geojson'
import { fetchRunnerLeg, type LngLat, type RunnerLeg } from '../lib/riverRunner'
import type { GraphFeature, MainstemFeatureProps } from '../lib/types'
import { lineLengthKm, locateOnLine, mercatorMetres, toMercatorCollection } from './geometry'
import { runVectorTool } from './whitebox'

export type AnalysisId = 'riverDistance' | 'hexbins'

export interface AnalysisParams {
  hexWidthKm: number
}

export interface LegendItem {
  color: string
  label: string
}

/**
 * Features carry their own styling for the shared analysis layers: `color`,
 * plus `width` (lines), `radius` (points) and an optional `label`.
 */
export interface AnalysisResult {
  id: AnalysisId
  summary: string
  legend?: LegendItem[]
  features: FeatureCollection
}

export interface AnalysisInput {
  mainstem: MainstemFeatureProps
  // The associated features currently shown (hidden sources excluded).
  features: GraphFeature[]
  params: AnalysisParams
  signal: AbortSignal
}

const CORAL = '#ee3d49'
const TEAL = '#12b0a8'
const NAVY = '#1c2954'
// Sequential light → dark blues, for the hexagon count classes.
const SEQUENTIAL = ['#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b']

const fmt = (n: number, digits = 1) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })

function line(coords: LngLat[], props: Record<string, unknown>): Feature {
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'LineString', coordinates: coords },
  }
}

function point(coords: LngLat, props: Record<string, unknown>): Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: coords } }
}

function collection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features }
}

// The selected mainstem's flowline; keep the last few so re-running doesn't
// refetch.
const legCache = new Map<string, Promise<RunnerLeg>>()
function selectedFlowline(uri: string, signal: AbortSignal): Promise<RunnerLeg> {
  let leg = legCache.get(uri)
  if (!leg) {
    leg = fetchRunnerLeg(uri, signal)
    leg.catch(() => legCache.delete(uri))
    legCache.set(uri, leg)
    if (legCache.size > 5) legCache.delete(legCache.keys().next().value!)
  }
  return leg
}

function locations(features: GraphFeature[]): { feature: GraphFeature; at: LngLat }[] {
  return features.map((feature) => ({ feature, at: [feature.lon, feature.lat] as LngLat }))
}

async function riverDistance({
  mainstem,
  features,
  signal,
}: AnalysisInput): Promise<AnalysisResult> {
  const leg = await selectedFlowline(mainstem.uri, signal)
  const length = lineLengthKm(leg.coords)
  const placed = locations(features).map(({ feature, at }) => {
    const { along, offset } = locateOnLine(at, leg.coords)
    return { feature, at, fromMouth: length - along, offset }
  })
  // Colored by position: teal at the headwaters shading to navy at the mouth.
  const shade = (fromMouth: number) => {
    const t = length ? fromMouth / length : 0
    return t > 0.66 ? TEAL : t > 0.33 ? '#2171b5' : NAVY
  }
  return {
    id: 'riverDistance',
    summary: `${fmt(placed.length, 0)} features placed along the ${fmt(length)} km ${leg.name}. Labels give km upstream from its mouth.`,
    legend: [
      { color: TEAL, label: 'Upper third' },
      { color: '#2171b5', label: 'Middle third' },
      { color: NAVY, label: 'Lower third' },
    ],
    features: collection([
      line(leg.coords, { color: CORAL, width: 3 }),
      ...placed.map(({ feature, at, fromMouth, offset }) =>
        point(at, {
          color: shade(fromMouth),
          radius: 6,
          label: `${fmt(fromMouth)} km`,
          name: feature.name ?? feature.uri,
          offset,
        }),
      ),
    ]),
  }
}

function midLatitude(coords: LngLat[]): number {
  const lats = coords.map(([, lat]) => lat)
  return (Math.min(...lats) + Math.max(...lats)) / 2
}

async function hexBins({ features, params }: AnalysisInput): Promise<AnalysisResult> {
  if (!features.length) throw new Error('There are no features to bin.')
  const placed = locations(features)
  const pts = placed.map(({ at }) => point(at, {}))
  const lat = midLatitude(placed.map(({ at }) => at))
  const hexes = await runVectorTool(
    'vector_hex_binning',
    toMercatorCollection(pts),
    (input, output) => [
      `--vector_points=${input}`,
      `--output=${output}`,
      `--width=${mercatorMetres(params.hexWidthKm, lat)}`,
    ],
  )
  const filled = hexes.features.filter((f) => Number(f.properties?.COUNT) > 0)
  const max = Math.max(1, ...filled.map((f) => Number(f.properties?.COUNT)))
  // Five equal-width count classes from 1 to the busiest hexagon.
  const classes = Math.min(5, max)
  const classOf = (count: number) =>
    Math.min(classes - 1, Math.floor(((count - 1) / max) * classes))
  const bounds = (i: number) => [
    Math.floor((i * max) / classes) + 1,
    Math.floor(((i + 1) * max) / classes),
  ]

  return {
    id: 'hexbins',
    summary: `${fmt(features.length, 0)} features fall in ${fmt(filled.length, 0)} hexagons ${fmt(params.hexWidthKm)} km across; the busiest holds ${fmt(max, 0)}.`,
    legend: Array.from({ length: classes }, (_, i) => {
      const [low, high] = bounds(i)
      return { color: SEQUENTIAL[i + 1], label: low === high ? `${low}` : `${low}–${high}` }
    }),
    features: collection(
      filled.map((hex) => {
        const count = Number(hex.properties?.COUNT)
        return {
          ...hex,
          properties: { color: SEQUENTIAL[classOf(count) + 1], opacity: 0.6, label: String(count) },
        }
      }),
    ),
  }
}

export const ANALYSES: Record<AnalysisId, (input: AnalysisInput) => Promise<AnalysisResult>> = {
  riverDistance,
  hexbins: hexBins,
}
