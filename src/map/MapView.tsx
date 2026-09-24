import {
  GeoJSONSource,
  Map as MaplibreMap,
  Popup as MaplibrePopup,
  type ExpressionSpecification,
  type StyleSpecification,
  type MapLayerMouseEvent,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { sitemapColorExpression } from '../lib/colors'
import {
  ELEVATION_SOURCE,
  HILLSHADE_LAYER_ID,
  HILLSHADE_SOURCE_ID,
  TERRAIN_EXAGGERATION,
  TERRAIN_PITCH,
  TERRAIN_SOURCE_ID,
  basemapById,
} from './basemaps'
import { computeBounds } from '../lib/geo'
import { sitemapKey } from '../lib/features'
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
  POINT_GEOMETRY_FILTER,
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

const APP_SOURCE_IDS = new Set([
  MAINSTEM_SOURCE_ID,
  ASSOCIATED_SOURCE_ID,
  SEARCH_SOURCE_ID,
  TERRAIN_SOURCE_ID,
  HILLSHADE_SOURCE_ID,
])

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
    if (APP_SOURCE_IDS.has(id)) sources[id] = source
  }
  const appLayers = previous.layers.filter(
    (layer) => 'source' in layer && APP_SOURCE_IDS.has(layer.source as string),
  )
  return { ...next, sources, layers: [...next.layers, ...appLayers], terrain: previous.terrain }
}

function toFeatureCollection(features: GraphFeature[]): FeatureCollection<Geometry> {
  return {
    type: 'FeatureCollection',
    features: features.map(
      (f): Feature<Geometry> => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          uri: f.uri,
          name: f.name ?? null,
          sitemap: f.sitemap ? normalizeSitemapId(f.sitemap) : null,
        },
      }),
    ),
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [map, setMap] = useState<MaplibreMap | null>(null)
  const {
    selectedMainstem,
    selectedNode,
    mainstemResource,
    searchResource,
    sitemapColorScale,
    hiddenSitemaps,
    basemap,
    terrain3d,
    flyToTarget,
    selectMainstem,
    selectNode,
    reportMapBounds,
  } = useExplorer()

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

      for (const layer of mainstemLayers) map.addLayer(layer)
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

      const featureLayers = [
        ASSOCIATED_FILL_LAYER_ID,
        ASSOCIATED_LINE_LAYER_ID,
        ASSOCIATED_LAYER_ID,
        SEARCH_FILL_LAYER_ID,
        SEARCH_LINE_LAYER_ID,
        SEARCH_LAYER_ID,
      ]
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

      map.on('mousemove', featureLayers, (e: MapLayerMouseEvent) => {
        const name = e.features?.[0]?.properties?.name as string | null | undefined
        if (!name) {
          hoverPopup.remove()
          return
        }
        hoverPopup.setLngLat(e.lngLat).setText(name).addTo(map)
      })
      for (const layerId of featureLayers) {
        map.on('mouseleave', layerId, () => hoverPopup.remove())
      }

      map.on('click', MAINSTEM_HIT_LAYER_ID, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        if (!feature) return
        const props = feature.properties as MainstemFeatureProps
        selectMainstem({
          uri: props.uri,
          name_at_outlet: props.name_at_outlet,
          lengthkm: props.lengthkm,
          outlet_drainagearea_sqkm: props.outlet_drainagearea_sqkm,
        })
      })

      map.on('click', featureLayers, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        const uri = feature?.properties?.uri as string | undefined
        if (!uri) return
        selectNode(uri)
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
            mainstemLayers[0].id,
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
    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
    return () => {
      map.off('style.load', apply)
    }
  }, [map, terrain3d])

  useEffect(() => {
    if (!map || appliedBasemap.current === basemap) return
    appliedBasemap.current = basemap
    map.setStyle(basemapById(basemap).style, { transformStyle: keepAppLayers })
  }, [map, basemap])

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
      (feature) => !hiddenSitemaps.has(sitemapKey(feature)),
    )
    source?.setData(toFeatureCollection(visible))
  }, [map, mainstemResource.data, hiddenSitemaps])

  useEffect(() => {
    if (!map) return
    const expression = sitemapColorExpression(sitemapColorScale)
    map.setPaintProperty(ASSOCIATED_LAYER_ID, 'circle-color', expression)
    map.setPaintProperty(ASSOCIATED_FILL_LAYER_ID, 'fill-color', expression)
    map.setPaintProperty(ASSOCIATED_LINE_LAYER_ID, 'line-color', expression)
    map.setPaintProperty(SEARCH_LAYER_ID, 'circle-color', expression)
    map.setPaintProperty(SEARCH_FILL_LAYER_ID, 'fill-color', expression)
    map.setPaintProperty(SEARCH_LINE_LAYER_ID, 'line-color', expression)
  }, [map, sitemapColorScale])

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

  return <div ref={containerRef} className="map-view" />
}
