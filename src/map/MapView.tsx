import {
  GeoJSONSource,
  Map as MaplibreMap,
  Popup as MaplibrePopup,
  type ExpressionSpecification,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { sitemapColorExpression } from '../lib/colors'
import { computeBounds } from '../lib/geo'
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

const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'

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
    flyToTarget,
    selectMainstem,
    selectNode,
    reportMapBounds,
  } = useExplorer()

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
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
    source?.setData(toFeatureCollection(mainstemResource.data ?? []))
  }, [map, mainstemResource.data])

  useEffect(() => {
    if (!map) return
    const expression = sitemapColorExpression(sitemapColorScale)
    map.setPaintProperty(ASSOCIATED_LAYER_ID, 'circle-color', expression)
    map.setPaintProperty(ASSOCIATED_FILL_LAYER_ID, 'fill-color', expression)
    map.setPaintProperty(ASSOCIATED_LINE_LAYER_ID, 'line-color', expression)
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
