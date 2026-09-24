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

const OPACITY_EXPRESSION: ExpressionSpecification = ['step', ['zoom'], 0.3, 6, 0.85]

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
      'line-color': '#08589e',
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
