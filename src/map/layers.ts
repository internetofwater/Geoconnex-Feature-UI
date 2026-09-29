import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl'
import { OTHER_SITEMAP_COLOR } from '../lib/colors'

export const MAINSTEM_SOURCE_ID = 'mainstems'
export const MAINSTEM_SOURCE_LAYER = 'mainstems'
export const MAINSTEM_TILE_URL =
  'https://reference.geoconnex.us/collections/mainstems/tiles/WebMercatorQuad/{z}/{y}/{x}?f=mvt'

export const ASSOCIATED_SOURCE_ID = 'associated-features'
export const ASSOCIATED_LAYER_ID = 'associated-features-points'
export const ASSOCIATED_FILL_LAYER_ID = 'associated-features-fill'
export const ASSOCIATED_LINE_LAYER_ID = 'associated-features-line'
export const ASSOCIATED_HIGHLIGHT_LAYER_ID = 'associated-features-highlight'
export const ASSOCIATED_LINE_HIGHLIGHT_LAYER_ID = 'associated-features-line-highlight'

export const SEARCH_SOURCE_ID = 'search-results'
export const SEARCH_LAYER_ID = 'search-results-points'
export const SEARCH_FILL_LAYER_ID = 'search-results-fill'
export const SEARCH_LINE_LAYER_ID = 'search-results-line'
export const SEARCH_HIGHLIGHT_LAYER_ID = 'search-results-highlight'
export const SEARCH_LINE_HIGHLIGHT_LAYER_ID = 'search-results-line-highlight'

// A distinct amber, not the coral used for the selected mainstem highlight — so
// "this is the thing you clicked" doesn't read as the same signal. Never the sitemap fill
// color either, which is reserved for source identity (the legend).
const FEATURE_HIGHLIGHT_COLOR = '#ffb703'

export const CONUS_BOUNDS: [number, number, number, number] = [
  -124.707777, 25.190876, -67.05824, 49.376613,
]

const DRAINAGE_SMALL = 160
const DRAINAGE_MEDIUM = 1600

export const MAINSTEM_HIGHLIGHT_LAYER_ID = 'mainstems-highlight'
export const MAINSTEM_HIT_LAYER_ID = 'mainstems-hit-area'

// Faint when zoomed out, where the network is dense. `scale` is the opacity
// set in the Layers tab.
export function mainstemLineOpacity(scale: number): ExpressionSpecification {
  return ['step', ['zoom'], 0.3 * scale, 6, 0.85 * scale]
}

const OPACITY_EXPRESSION = mainstemLineOpacity(1)
// The large rivers' blue, which stands for the whole network in the Layers tab.
export const MAINSTEM_LARGE_COLOR = '#08589e'

export const mainstemLayers: LayerSpecification[] = [
  {
    // Invisible, much wider than the visible line layers — gives clicks/hover a
    // generous hit target instead of requiring a pixel-perfect hit on a thin line.
    id: MAINSTEM_HIT_LAYER_ID,
    type: 'line',
    source: MAINSTEM_SOURCE_ID,
    'source-layer': MAINSTEM_SOURCE_LAYER,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': 18,
      'line-opacity': 0,
    },
  },
  {
    id: 'mainstems-small',
    type: 'line',
    source: MAINSTEM_SOURCE_ID,
    'source-layer': MAINSTEM_SOURCE_LAYER,
    filter: ['<', ['get', 'outlet_drainagearea_sqkm'], DRAINAGE_SMALL],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-opacity': OPACITY_EXPRESSION,
      'line-color': '#e0f3db',
      'line-width': 1.5,
    },
  },
  {
    id: 'mainstems-medium',
    type: 'line',
    source: MAINSTEM_SOURCE_ID,
    'source-layer': MAINSTEM_SOURCE_LAYER,
    filter: [
      'all',
      ['>=', ['get', 'outlet_drainagearea_sqkm'], DRAINAGE_SMALL],
      ['<', ['get', 'outlet_drainagearea_sqkm'], DRAINAGE_MEDIUM],
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-opacity': OPACITY_EXPRESSION,
      'line-color': '#7bccc4',
      'line-width': 2.5,
    },
  },
  {
    id: 'mainstems-large',
    type: 'line',
    source: MAINSTEM_SOURCE_ID,
    'source-layer': MAINSTEM_SOURCE_LAYER,
    filter: ['>=', ['get', 'outlet_drainagearea_sqkm'], DRAINAGE_MEDIUM],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-opacity': OPACITY_EXPRESSION,
      'line-color': MAINSTEM_LARGE_COLOR,
      'line-width': 4,
    },
  },
  {
    id: MAINSTEM_HIGHLIGHT_LAYER_ID,
    type: 'line',
    source: MAINSTEM_SOURCE_ID,
    'source-layer': MAINSTEM_SOURCE_LAYER,
    filter: ['==', ['get', 'uri'], ''],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': 6,
      'line-blur': 1,
      'line-color': '#ee3d49', // IoW coral — stands out against the blue/teal rivers
    },
  },
]

// A GeoJSON source can hold mixed geometry types at once. `fill` only draws
// Polygon/MultiPolygon and `line` draws LineString/MultiLineString *and*
// Polygon/MultiPolygon outlines, so both are naturally geometry-aware — a
// feature with the "wrong" geometry for that layer type just doesn't render.
// `circle`, however, is not: it draws a dot at every coordinate in a feature
// regardless of geometry type, so without a filter a polygon's vertices would
// each get their own dot. Every circle layer below is filtered down to
// Point/MultiPoint features explicitly to prevent that.
export const POINT_GEOMETRY_FILTER: ExpressionSpecification = [
  'any',
  ['==', ['geometry-type'], 'Point'],
  ['==', ['geometry-type'], 'MultiPoint'],
]

export const associatedFeaturesFillLayer: LayerSpecification = {
  id: ASSOCIATED_FILL_LAYER_ID,
  type: 'fill',
  source: ASSOCIATED_SOURCE_ID,
  paint: {
    'fill-color': OTHER_SITEMAP_COLOR,
    'fill-opacity': 0.35,
  },
}

export const associatedFeaturesLineLayer: LayerSpecification = {
  id: ASSOCIATED_LINE_LAYER_ID,
  type: 'line',
  source: ASSOCIATED_SOURCE_ID,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': OTHER_SITEMAP_COLOR,
    'line-width': 2,
  },
}

export const associatedFeaturesLayer: LayerSpecification = {
  id: ASSOCIATED_LAYER_ID,
  type: 'circle',
  source: ASSOCIATED_SOURCE_ID,
  filter: POINT_GEOMETRY_FILTER,
  paint: {
    'circle-radius': 5,
    'circle-color': OTHER_SITEMAP_COLOR,
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#ffffff',
  },
}

// Transparent-fill ring drawn around whichever feature is currently selected —
// a size/stroke cue layered on top so the dot's own fill color (source identity)
// never has to change to show selection.
export const associatedFeaturesHighlightLayer: LayerSpecification = {
  id: ASSOCIATED_HIGHLIGHT_LAYER_ID,
  type: 'circle',
  source: ASSOCIATED_SOURCE_ID,
  filter: ['all', POINT_GEOMETRY_FILTER, ['==', ['get', 'uri'], '']],
  paint: {
    'circle-radius': 10,
    'circle-color': 'transparent',
    'circle-stroke-width': 3,
    'circle-stroke-color': FEATURE_HIGHLIGHT_COLOR,
  },
}

// Same selection cue as above, but for polygon outlines / linestring geometry
// (a thicker glowing outline, matching the mainstem highlight treatment).
export const associatedFeaturesLineHighlightLayer: LayerSpecification = {
  id: ASSOCIATED_LINE_HIGHLIGHT_LAYER_ID,
  type: 'line',
  source: ASSOCIATED_SOURCE_ID,
  filter: ['==', ['get', 'uri'], ''],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-width': 4,
    'line-blur': 1,
    'line-color': FEATURE_HIGHLIGHT_COLOR,
  },
}

// Colored the same way as associated features (by sitemap source, see
// sitemapColorExpression) rather than a flat color — searching also clears any
// selected mainstem's associated features first, so the two layers are never
// competing for attention on screen at once, and a source's identity color
// stays consistent everywhere it appears.
export const searchResultsFillLayer: LayerSpecification = {
  id: SEARCH_FILL_LAYER_ID,
  type: 'fill',
  source: SEARCH_SOURCE_ID,
  paint: {
    'fill-color': OTHER_SITEMAP_COLOR,
    'fill-opacity': 0.35,
  },
}

export const searchResultsLineLayer: LayerSpecification = {
  id: SEARCH_LINE_LAYER_ID,
  type: 'line',
  source: SEARCH_SOURCE_ID,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': OTHER_SITEMAP_COLOR,
    'line-width': 2,
  },
}

export const searchResultsLayer: LayerSpecification = {
  id: SEARCH_LAYER_ID,
  type: 'circle',
  source: SEARCH_SOURCE_ID,
  filter: POINT_GEOMETRY_FILTER,
  paint: {
    'circle-radius': 6,
    'circle-color': OTHER_SITEMAP_COLOR,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  },
}

export const searchResultsHighlightLayer: LayerSpecification = {
  id: SEARCH_HIGHLIGHT_LAYER_ID,
  type: 'circle',
  source: SEARCH_SOURCE_ID,
  filter: ['all', POINT_GEOMETRY_FILTER, ['==', ['get', 'uri'], '']],
  paint: {
    'circle-radius': 11,
    'circle-color': 'transparent',
    'circle-stroke-width': 3,
    'circle-stroke-color': FEATURE_HIGHLIGHT_COLOR,
  },
}

export const searchResultsLineHighlightLayer: LayerSpecification = {
  id: SEARCH_LINE_HIGHLIGHT_LAYER_ID,
  type: 'line',
  source: SEARCH_SOURCE_ID,
  filter: ['==', ['get', 'uri'], ''],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-width': 4,
    'line-blur': 1,
    'line-color': FEATURE_HIGHLIGHT_COLOR,
  },
}

// The river runner's route: every downstream leg loaded so far, drawn over the
// mainstem network in the same coral as the selected-mainstem highlight.
export const RIVER_RUNNER_SOURCE_ID = 'river-runner-route'
export const RIVER_RUNNER_LAYER_ID = 'river-runner-route-line'

export const riverRunnerLayer: LayerSpecification = {
  id: RIVER_RUNNER_LAYER_ID,
  type: 'line',
  source: RIVER_RUNNER_SOURCE_ID,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': '#ee3d49',
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 12, 5, 16, 9],
    'line-opacity': 0.85,
  },
}

// Analysis results (Analysis tab). Every feature carries its own styling —
// `color`, `width`, `radius`, `opacity`, `label` — so one set of layers can draw
// any analysis.
export const ANALYSIS_SOURCE_ID = 'analysis'
const LABEL_FONT = ['Noto Sans Regular']

export const analysisLayers: LayerSpecification[] = [
  {
    id: 'analysis-fill',
    type: 'fill',
    source: ANALYSIS_SOURCE_ID,
    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
    paint: {
      'fill-color': ['coalesce', ['get', 'color'], '#12b0a8'],
      'fill-opacity': ['coalesce', ['get', 'opacity'], 0.3],
    },
  },
  {
    id: 'analysis-fill-outline',
    type: 'line',
    source: ANALYSIS_SOURCE_ID,
    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
    paint: { 'line-color': ['coalesce', ['get', 'color'], '#12b0a8'], 'line-width': 1 },
  },
  {
    id: 'analysis-line',
    type: 'line',
    source: ANALYSIS_SOURCE_ID,
    filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#ee3d49'],
      'line-width': ['coalesce', ['get', 'width'], 3],
    },
  },
  {
    id: 'analysis-point',
    type: 'circle',
    source: ANALYSIS_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': ['coalesce', ['get', 'color'], '#1c2954'],
      'circle-radius': ['coalesce', ['get', 'radius'], 5],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  },
  {
    id: 'analysis-label-point',
    type: 'symbol',
    source: ANALYSIS_SOURCE_ID,
    filter: ['has', 'label'],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': LABEL_FONT,
      'text-size': 12,
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: { 'text-color': '#1c2954', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  },
]

// The selected mainstem's path to the mouth (Analysis tab). Drawn above the
// mainstem network but below associated features, in an orange distinct from
// the coral selected-river highlight.
export const DOWNSTREAM_PATH_SOURCE_ID = 'downstream-path'

// Flood depth over the view it was computed for: an image source, created only
// once there's an image to show, since maplibre needs its URL up front.
export const FLOOD_DEPTH_SOURCE_ID = 'flood-depth'

export const floodDepthLayer: LayerSpecification = {
  id: 'flood-depth-raster',
  type: 'raster',
  source: FLOOD_DEPTH_SOURCE_ID,
  paint: { 'raster-opacity': 0.75, 'raster-fade-duration': 0 },
}

export const downstreamPathLayer: LayerSpecification = {
  id: 'downstream-path-line',
  type: 'line',
  source: DOWNSTREAM_PATH_SOURCE_ID,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': '#f28c28',
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 5, 14, 7],
    'line-opacity': 0.9,
  },
}

// Geoconnex PMTiles exports (Layers tab). Each archive gets its own source and
// a fill, outline and circle layer, filtered by geometry type so one set of
// layers draws any export. They sit under the mainstems, so the river network
// and selected features stay on top.
export const PMTILES_PREFIX = 'pmtiles:'
const PMTILES_POLYGON_FILTER: ExpressionSpecification = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon']],
]

export function pmtilesSourceId(id: string): string {
  return `${PMTILES_PREFIX}${id}`
}

export function pmtilesLayerSpecs(
  id: string,
  sourceLayer: string,
  color: string,
  opacity: number,
): LayerSpecification[] {
  const source = pmtilesSourceId(id)
  return [
    {
      id: `${source}:fill`,
      type: 'fill',
      source,
      'source-layer': sourceLayer,
      filter: PMTILES_POLYGON_FILTER,
      paint: { 'fill-color': color, 'fill-opacity': 0.12 * opacity },
    },
    {
      // Lines, and polygon outlines.
      id: `${source}:line`,
      type: 'line',
      source,
      'source-layer': sourceLayer,
      filter: ['!', POINT_GEOMETRY_FILTER],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': color,
        'line-opacity': opacity,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 10, 1.5, 14, 2.5],
      },
    },
    {
      id: `${source}:circle`,
      type: 'circle',
      source,
      'source-layer': sourceLayer,
      filter: POINT_GEOMETRY_FILTER,
      paint: {
        'circle-color': color,
        'circle-opacity': opacity,
        'circle-stroke-opacity': opacity,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2, 10, 4, 14, 6],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 10, 1],
      },
    },
  ]
}

// The feature search's area (a drawn box or a picked feature's extent), and
// the box while it's being drawn. Dashed, so it doesn't read as a feature.
export const SEARCH_AREA_SOURCE_ID = 'search-area'

export const searchAreaLayers: LayerSpecification[] = [
  {
    id: 'search-area-fill',
    type: 'fill',
    source: SEARCH_AREA_SOURCE_ID,
    paint: { 'fill-color': '#12b0a8', 'fill-opacity': 0.08 },
  },
  {
    id: 'search-area-line',
    type: 'line',
    source: SEARCH_AREA_SOURCE_ID,
    paint: { 'line-color': '#0b7d77', 'line-width': 2, 'line-dasharray': [3, 2] },
  },
]
