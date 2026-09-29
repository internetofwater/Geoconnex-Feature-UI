import {
  GeoJSONSource,
  Map as MaplibreMap,
  Marker as MaplibreMarker,
  Popup as MaplibrePopup,
  type ExpressionSpecification,
  type ImageSource,
  type StyleSpecification,
  type MapLibreEvent,
  type MapGeoJSONFeature,
  type MapMouseEvent,
  type Point,
  type PointLike,
  addProtocol,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { OTHER_SITEMAP_COLOR, sitemapColorExpression } from '../lib/colors'
import { DEFAULT_LAYER_STYLE, MAINSTEMS_STACK_ID, pmtilesProtocol } from '../lib/pmtiles'
import { pmtilesPopupContent } from './pmtilesPopup'
import {
  BUILDINGS_LAYER_ID,
  BUILDINGS_MINZOOM,
  BUILDINGS_PITCH,
  BUILDINGS_SOURCE,
  BUILDINGS_SOURCE_ID,
  ELEVATION_SOURCE,
  HILLSHADE_LAYER_ID,
  HILLSHADE_SOURCE_ID,
  TERRAIN_EXAGGERATION,
  TERRAIN_PITCH,
  TERRAIN_SOURCE_ID,
  basemapById,
  buildingColor,
} from './basemaps'
import { RiverRunner } from './RiverRunner'
import { renderFloodDepth } from '../analysis/floodDepth'
import { whenStyleReady } from './styleReady'
import type { Bbox } from '../lib/features'
import { computeBounds, geometryBounds } from '../lib/geo'
import { isShapeFeature, sitemapKey } from '../lib/features'
import { normalizeSitemapId } from '../lib/sitemaps'
import { useExplorer } from '../state/ExplorerContext'
import {
  ASSOCIATED_FILL_LAYER_ID,
  ASSOCIATED_HIGHLIGHT_LAYER_ID,
  ASSOCIATED_LAYER_ID,
  ASSOCIATED_LINE_HIGHLIGHT_LAYER_ID,
  ASSOCIATED_LINE_LAYER_ID,
  ASSOCIATED_SOURCE_ID,
  CONUS_BOUNDS,
  MAINSTEM_HIGHLIGHT_LAYER_ID,
  MAINSTEM_HIT_LAYER_ID,
  MAINSTEM_SOURCE_ID,
  MAINSTEM_TILE_URL,
  SEARCH_FILL_LAYER_ID,
  SEARCH_HIGHLIGHT_LAYER_ID,
  SEARCH_LAYER_ID,
  SEARCH_LINE_HIGHLIGHT_LAYER_ID,
  SEARCH_LINE_LAYER_ID,
  SEARCH_SOURCE_ID,
  RIVER_RUNNER_SOURCE_ID,
  ANALYSIS_SOURCE_ID,
  analysisLayers,
  DOWNSTREAM_PATH_SOURCE_ID,
  downstreamPathLayer,
  FLOOD_DEPTH_SOURCE_ID,
  floodDepthLayer,
  SEARCH_AREA_SOURCE_ID,
  searchAreaLayers,
  POINT_GEOMETRY_FILTER,
  PMTILES_PREFIX,
  mainstemLineOpacity,
  pmtilesLayerSpecs,
  pmtilesSourceId,
  associatedFeaturesFillLayer,
  associatedFeaturesHighlightLayer,
  associatedFeaturesLayer,
  associatedFeaturesLineHighlightLayer,
  associatedFeaturesLineLayer,
  mainstemLayers,
  searchResultsFillLayer,
  searchResultsHighlightLayer,
  searchResultsLayer,
  searchResultsLineHighlightLayer,
  searchResultsLineLayer,
} from './layers'
import type { GraphFeature, MainstemFeatureProps } from '../lib/types'

// maplibre locates its worker at runtime relative to its own module URL, which
// the production bundle doesn't emit (only the dev server, serving node_modules
// directly, has it). Have Vite bundle the worker — with its shared chunk — as a
// standalone asset and point maplibre at it explicitly.
setWorkerUrl(maplibreWorkerUrl)
addProtocol('pmtiles', pmtilesProtocol.tile)

function featureCollectionBounds(
  collection: FeatureCollection,
): [[number, number], [number, number]] | null {
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
  for (const feature of collection.features) {
    if (feature.geometry && 'coordinates' in feature.geometry) visit(feature.geometry.coordinates)
  }
  return west === Infinity
    ? null
    : [
        [west, south],
        [east, north],
      ]
}

const APP_SOURCE_IDS = new Set([
  MAINSTEM_SOURCE_ID,
  ASSOCIATED_SOURCE_ID,
  SEARCH_SOURCE_ID,
  TERRAIN_SOURCE_ID,
  HILLSHADE_SOURCE_ID,
  BUILDINGS_SOURCE_ID,
  RIVER_RUNNER_SOURCE_ID,
  ANALYSIS_SOURCE_ID,
  DOWNSTREAM_PATH_SOURCE_ID,
  FLOOD_DEPTH_SOURCE_ID,
  SEARCH_AREA_SOURCE_ID,
])

// Also covers each PMTiles export's source, whose ids aren't known up front.
function isAppSource(id: string): boolean {
  return APP_SOURCE_IDS.has(id) || id.startsWith(PMTILES_PREFIX)
}

const FEATURE_LAYER_IDS = [
  ASSOCIATED_FILL_LAYER_ID,
  ASSOCIATED_LINE_LAYER_ID,
  ASSOCIATED_LAYER_ID,
  SEARCH_FILL_LAYER_ID,
  SEARCH_LINE_LAYER_ID,
  SEARCH_LAYER_ID,
]

type PaintProperty = Parameters<MaplibreMap['setPaintProperty']>[1]

function isPmtilesFeature(feature: MapGeoJSONFeature): boolean {
  return feature.source.startsWith(PMTILES_PREFIX)
}

// Everything clickable under a point, topmost first, so a click goes to the
// feature drawn on top. PMTiles features only count with Hover Features for
// Info on.
function clickableFeaturesAt(
  map: MaplibreMap,
  { x, y }: Point,
  withPmtiles: boolean,
): MapGeoJSONFeature[] {
  const layers = [MAINSTEM_HIT_LAYER_ID, ...FEATURE_LAYER_IDS]
  if (withPmtiles) {
    for (const layer of map.getStyle().layers) {
      if (layer.id.startsWith(PMTILES_PREFIX)) layers.push(layer.id)
    }
  }
  // A few pixels of slack, so thin lines and small points are easy to hit.
  // Mid basemap switch some layers may not exist yet.
  return map.queryRenderedFeatures(
    [
      [x - 4, y - 4],
      [x + 4, y + 4],
    ],
    { layers: layers.filter((id) => map.getLayer(id)) },
  )
}

// The layers the Layers tab stacks (the mainstems and PMTiles exports) sit
// between the terrain-derived layers below and the rest of the app's above.
const ABOVE_STACK_LAYER_ID = downstreamPathLayer.id
const MAINSTEM_LAYER_IDS = new Set(mainstemLayers.map((layer) => layer.id))

function stackBottomLayerId(map: MaplibreMap): string {
  const bottom = map
    .getStyle()
    .layers.find((layer) => MAINSTEM_LAYER_IDS.has(layer.id) || layer.id.startsWith(PMTILES_PREFIX))
  // The mainstem layers are added with the map and never removed.
  return bottom?.id ?? mainstemLayers[0].id
}

// setStyle() replaces every source and layer, including the app's own. Carry
// those over from the outgoing style (with their current GeoJSON data and
// filters) and stack them on top of the incoming basemap.
function keepAppLayers(
  previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  if (!previous) return next
  const sources = { ...next.sources }
  for (const [id, source] of Object.entries(previous.sources)) {
    if (isAppSource(id)) sources[id] = source
  }
  const appLayers = previous.layers.filter(
    (layer) => 'source' in layer && isAppSource(layer.source as string),
  )
  return { ...next, sources, layers: [...next.layers, ...appLayers], terrain: previous.terrain }
}

function lngLatBbox(a: MapMouseEvent, b: MapMouseEvent): Bbox {
  return [
    Math.min(a.lngLat.lng, b.lngLat.lng),
    Math.min(a.lngLat.lat, b.lngLat.lat),
    Math.max(a.lngLat.lng, b.lngLat.lng),
    Math.max(a.lngLat.lat, b.lngLat.lat),
  ]
}

function bboxFeatures(bbox: Bbox | null): FeatureCollection {
  if (!bbox) return { type: 'FeatureCollection', features: [] }
  const [west, south, east, north] = bbox
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
      },
    ],
  }
}

function toFeatureCollection(features: GraphFeature[]): FeatureCollection<Geometry> {
  return {
    type: 'FeatureCollection',
    features: features.map((f): Feature<Geometry> => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        uri: f.uri,
        name: f.name ?? null,
        sitemap: f.sitemap ? normalizeSitemapId(f.sitemap) : null,
      },
    })),
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Set while Hover Features for Info is on: handles a click that lands on the
  // map, given everything clickable under it.
  const pmtilesClick = useRef<((features: MapGeoJSONFeature[], e: MapMouseEvent) => void) | null>(
    null,
  )
  // Set while picking a search area: takes over clicks on the map.
  const areaClick = useRef<((features: MapGeoJSONFeature[]) => void) | null>(null)
  const [map, setMap] = useState<MaplibreMap | null>(null)
  const {
    selectedMainstem,
    selectedNode,
    mainstemResource,
    searchResource,
    sitemapColorScale,
    hiddenSitemaps,
    hideShapes,
    layerStack,
    pmtilesInspect,
    showMainstems,
    layerStyles,
    sitemapEntriesResource,
    basemap,
    terrain3d,
    buildings3d,
    riverRunner,
    flyToTarget,
    fitTarget,
    placeMarker,
    analysisResult,
    showDownstreamPath,
    downstreamPathResource,
    floodDepth,
    floodLevel,
    selectMainstem,
    selectNode,
    reportMapBounds,
    searchArea,
    areaPicking,
    setAreaPicking,
    pickAreaBox,
    pickAreaFeature,
  } = useExplorer()

  // The context's actions change identity as it updates; the picking effects
  // below read the latest ones without restarting mid-drag.
  const areaActions = useRef({ setAreaPicking, pickAreaBox, pickAreaFeature })
  useEffect(() => {
    areaActions.current = { setAreaPicking, pickAreaBox, pickAreaFeature }
  }, [setAreaPicking, pickAreaBox, pickAreaFeature])

  // The basemap the map currently shows. Read (not depended on) when the map is
  // created, so switching basemaps restyles the existing map instead of
  // rebuilding it.
  const appliedBasemap = useRef(basemap)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MaplibreMap({
      container: containerRef.current,
      style: basemapById(appliedBasemap.current).style,
      bounds: CONUS_BOUNDS,
      fitBoundsOptions: { padding: 20 },
    })

    map.on('load', () => {
      map.addSource(MAINSTEM_SOURCE_ID, {
        type: 'vector',
        tiles: [MAINSTEM_TILE_URL],
        minzoom: 0,
        maxzoom: 10,
        bounds: CONUS_BOUNDS,
      })
      map.addSource(ASSOCIATED_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addSource(SEARCH_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addSource(DOWNSTREAM_PATH_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addSource(ANALYSIS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addSource(SEARCH_AREA_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      for (const layer of mainstemLayers) map.addLayer(layer)
      map.addLayer(downstreamPathLayer)
      for (const layer of searchAreaLayers) map.addLayer(layer)
      map.addLayer(associatedFeaturesFillLayer)
      map.addLayer(associatedFeaturesLineLayer)
      map.addLayer(associatedFeaturesLayer)
      map.addLayer(associatedFeaturesLineHighlightLayer)
      map.addLayer(associatedFeaturesHighlightLayer)
      map.addLayer(searchResultsFillLayer)
      map.addLayer(searchResultsLineLayer)
      map.addLayer(searchResultsLayer)
      map.addLayer(searchResultsLineHighlightLayer)
      map.addLayer(searchResultsHighlightLayer)
      for (const layer of analysisLayers) map.addLayer(layer)

      const featureLayers = FEATURE_LAYER_IDS
      const hoverLayers = [MAINSTEM_HIT_LAYER_ID, ...featureLayers]
      for (const layerId of hoverLayers) {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      const hoverPopup = new MaplibrePopup({
        closeButton: false,
        closeOnClick: false,
        className: 'feature-hover-popup',
      })

      // Hover is re-checked when the camera moves too, not only when the mouse
      // does: during the river runner features slide under a still cursor.
      let hoverPoint: PointLike | null = null
      let lastHoverCheck = 0
      const updateHover = () => {
        if (!hoverPoint) return
        let name: string | null | undefined
        try {
          name = map.queryRenderedFeatures(hoverPoint, { layers: featureLayers })[0]?.properties
            ?.name as string | null | undefined
        } catch {
          // Mid basemap switch the layers may not exist yet; try again next move.
          return
        }
        if (name) hoverPopup.setLngLat(map.unproject(hoverPoint)).setText(name).addTo(map)
        else hoverPopup.remove()
      }
      map.on('mousemove', (e: MapMouseEvent) => {
        hoverPoint = e.point
        updateHover()
      })
      map.getCanvas().addEventListener('mouseleave', () => {
        hoverPoint = null
        hoverPopup.remove()
      })
      map.on('move', (e: MapLibreEvent<unknown>) => {
        // Programmatic moves only (a drag already produces mousemoves); throttled
        // since the runner moves the camera every frame.
        if ((e as { originalEvent?: Event }).originalEvent) return
        const now = performance.now()
        if (now - lastHoverCheck < 100) return
        lastHoverCheck = now
        updateHover()
      })

      // One handler for every clickable layer, so only the topmost feature
      // under the cursor responds.
      map.on('click', (e: MapMouseEvent) => {
        const pickArea = areaClick.current
        const inspect = pmtilesClick.current
        let features: MapGeoJSONFeature[]
        try {
          features = clickableFeaturesAt(map, e.point, !!pickArea || inspect !== null)
        } catch {
          return
        }
        if (pickArea) {
          pickArea(features)
          return
        }
        inspect?.(features, e)
        const feature = features[0]
        if (!feature || isPmtilesFeature(feature)) return
        if (feature.layer.id === MAINSTEM_HIT_LAYER_ID) {
          const props = feature.properties as MainstemFeatureProps
          selectMainstem({
            uri: props.uri,
            name_at_outlet: props.name_at_outlet,
            lengthkm: props.lengthkm,
            outlet_drainagearea_sqkm: props.outlet_drainagearea_sqkm,
          })
          return
        }
        const uri = feature.properties?.uri as string | undefined
        if (uri) selectNode(uri)
      })

      const reportBounds = () => {
        const b = map.getBounds()
        reportMapBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
      }
      map.on('moveend', reportBounds)
      reportBounds()

      setMap(map)
    })

    return () => {
      map.remove()
      setMap(null)
    }
  }, [selectMainstem, selectNode, reportMapBounds])

  useEffect(() => {
    if (!map) return
    const apply = () => {
      if (terrain3d) {
        if (!map.getSource(TERRAIN_SOURCE_ID)) map.addSource(TERRAIN_SOURCE_ID, ELEVATION_SOURCE)
        if (!map.getSource(HILLSHADE_SOURCE_ID)) {
          map.addSource(HILLSHADE_SOURCE_ID, ELEVATION_SOURCE)
        }
        if (!map.getLayer(HILLSHADE_LAYER_ID)) {
          // Under the app's own layers so rivers and features stay crisp.
          map.addLayer(
            {
              id: HILLSHADE_LAYER_ID,
              type: 'hillshade',
              source: HILLSHADE_SOURCE_ID,
              paint: { 'hillshade-exaggeration': 0.4 },
            },
            stackBottomLayerId(map),
          )
        }
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION })
        if (map.getPitch() < 30) map.easeTo({ pitch: TERRAIN_PITCH, duration: 800 })
      } else {
        map.setTerrain(null)
        if (map.getLayer(HILLSHADE_LAYER_ID)) map.removeLayer(HILLSHADE_LAYER_ID)
        if (map.getPitch() > 0) map.easeTo({ pitch: 0, bearing: 0, duration: 800 })
      }
    }
    // A basemap switch may still be loading; sources can't be added until it is.
    return whenStyleReady(map, apply)
  }, [map, terrain3d])

  useEffect(() => {
    if (!map || appliedBasemap.current === basemap) return
    appliedBasemap.current = basemap
    map.setStyle(basemapById(basemap).style, { transformStyle: keepAppLayers })
  }, [map, basemap])

  // Runs after the basemap effect above, so a basemap switch re-applies the
  // color and re-hides the incoming style's own extrusions.
  useEffect(() => {
    if (!map) return
    const apply = () => {
      if (buildings3d) {
        if (!map.getSource(BUILDINGS_SOURCE_ID)) {
          map.addSource(BUILDINGS_SOURCE_ID, BUILDINGS_SOURCE)
        }
        if (!map.getLayer(BUILDINGS_LAYER_ID)) {
          // Under the app's own layers, like the hillshade.
          map.addLayer(
            {
              id: BUILDINGS_LAYER_ID,
              type: 'fill-extrusion',
              source: BUILDINGS_SOURCE_ID,
              'source-layer': 'building',
              minzoom: BUILDINGS_MINZOOM,
              paint: {
                'fill-extrusion-base': ['get', 'render_min_height'],
                'fill-extrusion-height': ['get', 'render_height'],
                'fill-extrusion-opacity': 0.8,
              },
            },
            stackBottomLayerId(map),
          )
        }
        map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-color', buildingColor(basemap))
      } else if (map.getLayer(BUILDINGS_LAYER_ID)) {
        map.removeLayer(BUILDINGS_LAYER_ID)
      }
      // The Streets basemap ships its own 3D buildings; hide them while ours
      // are on so the two don't z-fight, and bring them back after.
      for (const layer of map.getStyle().layers) {
        if (layer.type === 'fill-extrusion' && layer.id !== BUILDINGS_LAYER_ID) {
          map.setLayoutProperty(layer.id, 'visibility', buildings3d ? 'none' : 'visible')
        }
      }
    }
    return whenStyleReady(map, apply)
  }, [map, buildings3d, basemap])

  // Buildings only read as 3D from an angle, so tilt a flat map on turning
  // them on. Kept apart from the effect above so a basemap switch doesn't re-tilt.
  useEffect(() => {
    if (map && buildings3d && map.getPitch() < 30) {
      map.easeTo({ pitch: BUILDINGS_PITCH, duration: 800 })
    }
  }, [map, buildings3d])

  // Hiding the network also hides its hit area, so rivers can't be clicked while
  // they're hidden. The selected river's highlight stays, to keep its place.
  useEffect(() => {
    if (!map) return
    const visibility = showMainstems ? 'visible' : 'none'
    for (const layer of mainstemLayers) {
      if (layer.id !== MAINSTEM_HIGHLIGHT_LAYER_ID) {
        map.setLayoutProperty(layer.id, 'visibility', visibility)
      }
    }
  }, [map, showMainstems])

  useEffect(() => {
    if (!map) return
    map.setFilter(MAINSTEM_HIGHLIGHT_LAYER_ID, ['==', ['get', 'uri'], selectedMainstem?.uri ?? ''])
  }, [map, selectedMainstem])

  useEffect(() => {
    if (!map) return
    const uriMatch: ExpressionSpecification = ['==', ['get', 'uri'], selectedNode ?? '']
    // The circle-type highlight layers need the same Point-only filter as their
    // base circle layers (see POINT_GEOMETRY_FILTER) or they'd ring every vertex
    // of a selected polygon; the line-type ones don't draw anything for points
    // anyway, so they only need the uri match.
    map.setFilter(ASSOCIATED_HIGHLIGHT_LAYER_ID, ['all', POINT_GEOMETRY_FILTER, uriMatch])
    map.setFilter(SEARCH_HIGHLIGHT_LAYER_ID, ['all', POINT_GEOMETRY_FILTER, uriMatch])
    map.setFilter(ASSOCIATED_LINE_HIGHLIGHT_LAYER_ID, uriMatch)
    map.setFilter(SEARCH_LINE_HIGHLIGHT_LAYER_ID, uriMatch)
  }, [map, selectedNode])

  useEffect(() => {
    if (!map) return
    const source = map.getSource(ASSOCIATED_SOURCE_ID) as GeoJSONSource | undefined
    const visible = (mainstemResource.data ?? []).filter(
      (feature) =>
        !hiddenSitemaps.has(sitemapKey(feature)) && !(hideShapes && isShapeFeature(feature)),
    )
    source?.setData(toFeatureCollection(visible))
  }, [map, mainstemResource.data, hiddenSitemaps, hideShapes])

  useEffect(() => {
    // Until sitemap.xml loads the scale is empty, and a `match` with no cases is
    // invalid — the layers keep their default gray until then.
    if (!map || sitemapColorScale.size === 0) return
    const expression = sitemapColorExpression(sitemapColorScale)
    map.setPaintProperty(ASSOCIATED_LAYER_ID, 'circle-color', expression)
    map.setPaintProperty(ASSOCIATED_FILL_LAYER_ID, 'fill-color', expression)
    map.setPaintProperty(ASSOCIATED_LINE_LAYER_ID, 'line-color', expression)
    map.setPaintProperty(SEARCH_LAYER_ID, 'circle-color', expression)
    map.setPaintProperty(SEARCH_FILL_LAYER_ID, 'fill-color', expression)
    map.setPaintProperty(SEARCH_LINE_LAYER_ID, 'line-color', expression)
  }, [map, sitemapColorScale])

  useEffect(() => {
    if (!map) return
    const source = map.getSource(ANALYSIS_SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(analysisResult?.features ?? { type: 'FeatureCollection', features: [] })
    const bounds = analysisResult && featureCollectionBounds(analysisResult.features)
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 420, right: 60 },
        maxZoom: 13,
        duration: 800,
      })
    }
  }, [map, analysisResult])

  useEffect(() => {
    if (!map) return
    const legs = showDownstreamPath ? (downstreamPathResource.data ?? []) : []
    const source = map.getSource(DOWNSTREAM_PATH_SOURCE_ID) as GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: legs.map((leg) => ({
        type: 'Feature',
        properties: { name: leg.name },
        geometry: { type: 'LineString', coordinates: leg.coords },
      })),
    })
  }, [map, showDownstreamPath, downstreamPathResource.data])

  // The switched-on PMTiles exports and the mainstems, stacked in the Layers
  // tab's order. The rest of the app's layers stay above the whole stack.
  useEffect(() => {
    if (!map) return
    const ready = layerStack.filter(
      (layer) => layer.kind === 'mainstems' || layer.status === 'ready',
    )
    const apply = () => {
      const wanted = new Set(
        ready.flatMap((layer) => (layer.kind === 'pmtiles' ? [pmtilesSourceId(layer.id)] : [])),
      )
      const style = map.getStyle()
      for (const layer of style.layers) {
        const source = 'source' in layer ? layer.source : undefined
        if (source?.startsWith(PMTILES_PREFIX) && !wanted.has(source)) map.removeLayer(layer.id)
      }
      for (const id of Object.keys(style.sources)) {
        if (id.startsWith(PMTILES_PREFIX) && !wanted.has(id)) map.removeSource(id)
      }
      // Bottom of the list first: each goes just under the layers above the
      // stack, so the last one placed (the top of the list) ends up highest.
      for (const layer of ready.toReversed()) {
        if (layer.kind === 'mainstems') {
          for (const spec of mainstemLayers) {
            if (spec.id !== MAINSTEM_HIGHLIGHT_LAYER_ID)
              map.moveLayer(spec.id, ABOVE_STACK_LAYER_ID)
          }
          continue
        }
        if (layer.status !== 'ready') continue
        const sourceId = pmtilesSourceId(layer.id)
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: 'vector', url: `pmtiles://${layer.url}` })
        }
        const style = layerStyles.get(layer.id) ?? DEFAULT_LAYER_STYLE
        const color = style.color ?? sitemapColorScale.get(layer.id) ?? OTHER_SITEMAP_COLOR
        const specs = pmtilesLayerSpecs(layer.id, layer.info.sourceLayer, color, style.opacity)
        for (const spec of specs) {
          if (map.getLayer(spec.id)) {
            map.moveLayer(spec.id, ABOVE_STACK_LAYER_ID)
            // The color or opacity may have changed since the layer was added.
            const paint = ('paint' in spec ? spec.paint : undefined) ?? {}
            for (const [property, value] of Object.entries(paint)) {
              map.setPaintProperty(spec.id, property as PaintProperty, value)
            }
          } else {
            map.addLayer(spec, ABOVE_STACK_LAYER_ID)
          }
        }
      }
      // The selected river stays visible over the whole stack.
      map.moveLayer(MAINSTEM_HIGHLIGHT_LAYER_ID, ABOVE_STACK_LAYER_ID)
    }
    return whenStyleReady(map, apply)
  }, [map, layerStack, layerStyles, sitemapColorScale])

  // The mainstems' color and opacity from their settings in the Layers tab.
  const mainstemStyle = layerStyles.get(MAINSTEMS_STACK_ID) ?? DEFAULT_LAYER_STYLE
  useEffect(() => {
    if (!map) return
    for (const spec of mainstemLayers) {
      if (spec.id === MAINSTEM_HIT_LAYER_ID || spec.id === MAINSTEM_HIGHLIGHT_LAYER_ID) continue
      if (spec.type !== 'line') continue
      map.setPaintProperty(spec.id, 'line-color', mainstemStyle.color ?? spec.paint?.['line-color'])
      map.setPaintProperty(spec.id, 'line-opacity', mainstemLineOpacity(mainstemStyle.opacity))
    }
  }, [map, mainstemStyle])

  // Read by the popups below when they open, so restyling a layer doesn't
  // reset them (and close a pinned one).
  const popupLabels = useRef({
    titles: new Map<string, string>(),
    colors: (_id: string): string => OTHER_SITEMAP_COLOR,
  })
  useEffect(() => {
    popupLabels.current = {
      titles: new Map(
        (sitemapEntriesResource.data ?? []).map((entry) => [
          entry.id,
          entry.description ?? entry.id,
        ]),
      ),
      colors: (id) =>
        layerStyles.get(id)?.color ?? sitemapColorScale.get(id) ?? OTHER_SITEMAP_COLOR,
    }
  }, [sitemapEntriesResource.data, sitemapColorScale, layerStyles])

  // With Hover Features for Info on, hovering a PMTiles feature shows all its
  // properties, and clicking one pins them in a popup that stays open until
  // closed. Either only when the feature is the topmost thing under the cursor.
  useEffect(() => {
    if (!map || !pmtilesInspect) return
    const popupOptions = { closeOnClick: false, maxWidth: '340px', offset: 14 }
    const hover = new MaplibrePopup({
      ...popupOptions,
      closeButton: false,
      className: 'pmtiles-inspect-popup',
    })
    const pinned = new MaplibrePopup({
      ...popupOptions,
      className: 'pmtiles-inspect-popup pinned',
    })
    let pinnedKey: string | null = null
    pinned.on('close', () => {
      pinnedKey = null
    })
    const canvas = map.getCanvas()
    let pointer = false

    // A feature's identity across its fill and outline layers.
    const keyOf = (f: MapGeoJSONFeature) =>
      `${f.source}|${f.properties.id ?? JSON.stringify(f.properties)}`

    // The PMTiles features under the cursor, if one of them is on top.
    const pmtilesHits = (features: MapGeoJSONFeature[]) =>
      features[0] && isPmtilesFeature(features[0]) ? features.filter(isPmtilesFeature) : []

    const content = (features: MapGeoJSONFeature[]) => {
      const feature = features[0]
      const id = feature.source.slice(PMTILES_PREFIX.length)
      const { titles, colors } = popupLabels.current
      return pmtilesPopupContent({
        title: titles.get(id) ?? id,
        color: colors(id),
        properties: feature.properties,
        others: new Set(features.map(keyOf)).size - 1,
      })
    }

    const onMove = (e: MapMouseEvent) => {
      let features: MapGeoJSONFeature[]
      try {
        features = pmtilesHits(clickableFeaturesAt(map, e.point, true))
      } catch {
        return
      }
      // Only undo a pointer cursor set here, not one from the app's own layers.
      if (features.length || pointer) canvas.style.cursor = features.length ? 'pointer' : ''
      pointer = features.length > 0
      // No hover popup over the feature already pinned.
      if (!features.length || keyOf(features[0]) === pinnedKey) {
        hover.remove()
        return
      }
      hover.setLngLat(e.lngLat).setDOMContent(content(features)).addTo(map)
    }
    pmtilesClick.current = (clicked, e) => {
      const features = pmtilesHits(clicked)
      if (!features.length) {
        pinned.remove()
        return
      }
      hover.remove()
      pinnedKey = keyOf(features[0])
      pinned.setLngLat(e.lngLat).setDOMContent(content(features)).addTo(map)
    }
    const onLeave = () => hover.remove()

    map.on('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    return () => {
      pmtilesClick.current = null
      map.off('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
      if (pointer) canvas.style.cursor = ''
      hover.remove()
      pinned.remove()
    }
  }, [map, pmtilesInspect])

  // Redrawn whenever the water level moves; the heavy HAND computation behind
  // it has already happened once.
  const floodCanvas = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!map) return
    const apply = () => {
      const source = map.getSource(FLOOD_DEPTH_SOURCE_ID) as ImageSource | undefined
      if (!floodDepth) {
        if (map.getLayer(floodDepthLayer.id)) map.removeLayer(floodDepthLayer.id)
        if (source) map.removeSource(FLOOD_DEPTH_SOURCE_ID)
        return
      }
      floodCanvas.current ??= document.createElement('canvas')
      const url = renderFloodDepth(floodDepth, floodLevel, floodCanvas.current)
      const { coordinates } = floodDepth
      if (source) source.updateImage({ url, coordinates })
      else map.addSource(FLOOD_DEPTH_SOURCE_ID, { type: 'image', url, coordinates })
      // Under the app's own layers, like the hillshade, so rivers stay on top.
      if (!map.getLayer(floodDepthLayer.id)) map.addLayer(floodDepthLayer, stackBottomLayerId(map))
    }
    return whenStyleReady(map, apply)
  }, [map, floodDepth, floodLevel])

  useEffect(() => {
    if (!map || !placeMarker) return
    const element = document.createElement('div')
    element.className = 'place-marker'
    // MapLibre positions the marker through its element's transform, so the
    // rotated pin shape lives on a child.
    element.appendChild(document.createElement('div')).className = 'place-marker-pin'
    const marker = new MaplibreMarker({ element, anchor: 'bottom' })
      .setLngLat(placeMarker)
      .addTo(map)
    return () => {
      marker.remove()
    }
  }, [map, placeMarker])

  useEffect(() => {
    if (!map || !fitTarget) return
    const [west, south, east, north] = fitTarget
    // Left padding clears the side panel, as for search results.
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: { top: 60, bottom: 60, left: 420, right: 60 }, maxZoom: 15, duration: 1000 },
    )
  }, [map, fitTarget])

  useEffect(() => {
    if (!map || !flyToTarget) return
    map.flyTo({
      center: flyToTarget,
      zoom: Math.max(map.getZoom(), 13),
      duration: 1000,
      essential: true,
    })
  }, [map, flyToTarget])

  useEffect(() => {
    if (!map) return
    const features = searchResource.data ?? []
    const source = map.getSource(SEARCH_SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(toFeatureCollection(features))

    const bounds = computeBounds(features)
    // Left padding clears the side panel so fitted results aren't hidden behind it.
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 420, right: 60 },
        maxZoom: 14,
        duration: 800,
      })
    }
  }, [map, searchResource.data])

  // The search area outlined on the map, once there is one.
  const areaBbox =
    searchArea.kind === 'box' || searchArea.kind === 'feature' ? searchArea.bbox : null
  useEffect(() => {
    if (!map) return
    const source = map.getSource(SEARCH_AREA_SOURCE_ID) as GeoJSONSource | undefined
    source?.setData(bboxFeatures(areaBbox))
    // Also when picking ends, to clear a box drawn but not kept.
  }, [map, areaBbox, areaPicking])

  // Picking a search area: a crosshair, Esc to stop, and while drawing a box,
  // dragging draws instead of panning.
  useEffect(() => {
    if (!map || !areaPicking) return
    const container = map.getContainer()
    container.classList.add('area-picking')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') areaActions.current.setAreaPicking(null)
    }
    window.addEventListener('keydown', onKey)

    const source = map.getSource(SEARCH_AREA_SOURCE_ID) as GeoJSONSource | undefined
    let start: MapMouseEvent | null = null
    const onDown = (e: MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      start = e
    }
    const onMove = (e: MapMouseEvent) => {
      if (start) source?.setData(bboxFeatures(lngLatBbox(start, e)))
    }
    const onUp = (e: MapMouseEvent) => {
      if (!start) return
      const from = start
      start = null
      // Too small to mean a box; likely a stray click.
      if (Math.abs(e.point.x - from.point.x) < 5 || Math.abs(e.point.y - from.point.y) < 5) {
        source?.setData(bboxFeatures(null))
        return
      }
      areaActions.current.pickAreaBox(lngLatBbox(from, e))
    }

    if (areaPicking === 'box') {
      map.dragPan.disable()
      map.boxZoom.disable()
      map.on('mousedown', onDown)
      map.on('mousemove', onMove)
      map.on('mouseup', onUp)
      // Clicks (a press without a drag) do nothing while drawing.
      areaClick.current = () => {}
    } else {
      areaClick.current = (features) => {
        const feature = features[0]
        const bbox = feature && geometryBounds(feature.geometry)
        if (!feature || !bbox) return
        const props = feature.properties
        const uri = isPmtilesFeature(feature) ? props.id : props.uri
        const name = props.feature_name ?? props.name_at_outlet ?? props.name
        areaActions.current.pickAreaFeature({
          uri: typeof uri === 'string' ? uri : null,
          name: typeof name === 'string' ? name : null,
          bbox,
        })
      }
    }

    return () => {
      container.classList.remove('area-picking')
      window.removeEventListener('keydown', onKey)
      areaClick.current = null
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
      map.dragPan.enable()
      map.boxZoom.enable()
    }
  }, [map, areaPicking])

  return (
    <>
      <div ref={containerRef} className="map-view" />
      {areaPicking && (
        <div className="map-hint" role="status">
          {areaPicking === 'box'
            ? 'Drag on the map to draw the search area'
            : 'Click a feature to search within its extent'}
          <span>Esc to cancel</span>
        </div>
      )}
      {map && riverRunner && <RiverRunner key={riverRunner.uri} map={map} start={riverRunner} />}
    </>
  )
}
