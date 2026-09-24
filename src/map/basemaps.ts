import type { RasterDEMSourceSpecification, StyleSpecification } from 'maplibre-gl'

export type BasemapId = 'light' | 'streets' | 'dark' | 'topo' | 'satellite'

export interface Basemap {
  id: BasemapId
  label: string
  description: string
  style: string | StyleSpecification
}

function rasterStyle(tiles: string, attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: { type: 'raster', tiles: [tiles], tileSize: 256, attribution, maxzoom: 19 },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
    // Raster basemaps have no labels of their own, but analysis labels need a
    // glyph source; OpenFreeMap's is the one the vector basemaps use.
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  }
}

export const BASEMAPS: Basemap[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Muted grayscale that keeps the data in front',
    style: 'https://tiles.openfreemap.org/styles/positron',
  },
  {
    id: 'streets',
    label: 'Streets',
    description: 'Roads, places and land cover in full color',
    style: 'https://tiles.openfreemap.org/styles/liberty',
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Low-glare dark background',
    style: 'https://tiles.openfreemap.org/styles/dark',
  },
  {
    id: 'topo',
    label: 'Topographic',
    description: 'USGS National Map topo with contours and hydrography',
    style: rasterStyle(
      'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
      'USGS The National Map',
    ),
  },
  {
    id: 'satellite',
    label: 'Satellite',
    description: 'Esri World Imagery',
    style: rasterStyle(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    ),
  },
]

export const DEFAULT_BASEMAP: BasemapId = 'light'

export function basemapById(id: BasemapId): Basemap {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0]
}

// Terrarium-encoded elevation tiles (AWS Open Data "Terrain Tiles"). MapLibre
// recommends separate sources for 3D terrain and hillshade, even when both come
// from the same tiles.
export const TERRAIN_SOURCE_ID = 'terrain-dem'
export const HILLSHADE_SOURCE_ID = 'hillshade-dem'
export const HILLSHADE_LAYER_ID = 'terrain-hillshade'
export const TERRAIN_EXAGGERATION = 1.5
export const TERRAIN_PITCH = 60

export const ELEVATION_SOURCE: RasterDEMSourceSpecification = {
  type: 'raster-dem',
  tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 15,
  attribution: 'Elevation: Mapzen Terrain Tiles (AWS Open Data)',
}
