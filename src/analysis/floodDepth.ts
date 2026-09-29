import type { Bbox } from '../lib/features'
import { ELEVATION_SOURCE } from '../map/basemaps'
import { runRasterPipeline, type Grid } from './whitebox'

/**
 * Height Above Nearest Drainage (HAND) for the map view: how far each cell sits
 * above the stream it drains to. Nobody serves HAND as browser-readable tiles
 * (NOAA's is in a requester-pays bucket), so it's derived here from the same
 * Terrarium elevation tiles as 3D terrain, with WhiteboxTools. Raising a water
 * level over it is the "flood to X metres" approximation behind NOAA's FIM.
 */
export interface FloodDepth {
  width: number
  height: number
  // Metres above the nearest stream per cell, row-major from the top; NaN
  // where it couldn't be computed.
  values: Float32Array
  // Corners for a maplibre image source: top-left, top-right, bottom-right,
  // bottom-left.
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  // Ground size of one cell, and the tile zoom it came from.
  cellSizeM: number
  zoom: number
}

const TILE_SIZE = 256
export const MAX_ZOOM = 14
// Coarser than ~60 m cells and small valleys vanish.
export const MIN_ZOOM = 11
// Tiles across the view, before padding. 5×5 plus a one-tile pad is ~3M cells,
// a few seconds of work.
export const MAX_VIEW_TILES = 5
// Tiles of context around the view, so streams entering from outside it still
// accumulate enough flow to register and edge cells can drain somewhere.
export const PAD_TILES = 1
// Contributing area for a cell to count as a stream. Smaller picks up gullies,
// larger drops creeks people would expect to flood.
export const STREAM_AREA_M2 = 1_000_000
const EARTH_RADIUS = 6378137
const NO_DATA = -9999

const tileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
function tileY(lat: number, z: number): number {
  const φ = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * 2 ** z
}
const tileLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const tileLat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

interface TileRange {
  z: number
  x0: number
  y0: number
  cols: number
  rows: number
}

// The finest zoom whose tiles cover the view within the tile budget.
function pickTiles([west, south, east, north]: Bbox): TileRange {
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const x0 = Math.floor(tileX(west, z))
    const y0 = Math.floor(tileY(north, z))
    const cols = Math.floor(tileX(east, z)) - x0 + 1
    const rows = Math.floor(tileY(south, z)) - y0 + 1
    if (cols <= MAX_VIEW_TILES && rows <= MAX_VIEW_TILES) return { z, x0, y0, cols, rows }
  }
  throw new Error('Zoom in closer (or tilt the map less) to compute flood depth for this view.')
}

async function fetchElevationTile(
  z: number,
  x: number,
  y: number,
  signal: AbortSignal,
): Promise<Float32Array> {
  const url = ELEVATION_SOURCE.tiles![0].replace('{z}', String(z))
    .replace('{x}', String(((x % 2 ** z) + 2 ** z) % 2 ** z))
    .replace('{y}', String(y))
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Elevation tile ${z}/${x}/${y} failed (${response.status})`)
  // Skip color management and premultiplication: the RGB bytes are data.
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  })
  const context = new OffscreenCanvas(TILE_SIZE, TILE_SIZE).getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  const { data } = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE)
  const elevation = new Float32Array(TILE_SIZE * TILE_SIZE)
  for (let i = 0; i < elevation.length; i++) {
    // Terrarium encoding: metres = R × 256 + G + B / 256 − 32768.
    elevation[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768
  }
  return elevation
}

export async function computeFloodDepth(view: Bbox, signal: AbortSignal): Promise<FloodDepth> {
  const { z, x0, y0, cols, rows } = pickTiles(view)
  const px0 = x0 - PAD_TILES
  const py0 = y0 - PAD_TILES
  const pcols = cols + 2 * PAD_TILES
  const prows = rows + 2 * PAD_TILES
  const width = pcols * TILE_SIZE
  const height = prows * TILE_SIZE

  const dem = new Float32Array(width * height)
  await Promise.all(
    Array.from({ length: pcols * prows }, async (_, i) => {
      const col = i % pcols
      const row = Math.floor(i / pcols)
      const tile = await fetchElevationTile(z, px0 + col, py0 + row, signal)
      for (let y = 0; y < TILE_SIZE; y++) {
        dem.set(
          tile.subarray(y * TILE_SIZE, (y + 1) * TILE_SIZE),
          (row * TILE_SIZE + y) * width + col * TILE_SIZE,
        )
      }
    }),
  )
  signal.throwIfAborted()

  // Whitebox works in the grid's own units, so give it Web Mercator metres.
  const tileMetres = (2 * Math.PI * EARTH_RADIUS) / 2 ** z
  const cellSize = tileMetres / TILE_SIZE
  const grid: Grid = {
    width,
    height,
    xll: -Math.PI * EARTH_RADIUS + px0 * tileMetres,
    yll: Math.PI * EARTH_RADIUS - (py0 + prows) * tileMetres,
    cellSize,
    noData: NO_DATA,
    values: dem,
  }
  // Mercator stretches cells by 1/cos(latitude); the stream threshold is an
  // area on the ground.
  const midLat = tileLat(y0 + rows / 2, z)
  const cellSizeM = cellSize * Math.cos((midLat * Math.PI) / 180)
  const streamCells = Math.round(STREAM_AREA_M2 / cellSizeM ** 2)

  const out = await runRasterPipeline(
    [
      // Terrarium flattens rivers and lakes; without a flat increment, flow
      // pools on them and never reaches the channel downstream.
      {
        tool: 'breach_depressions_least_cost',
        args: [
          '--input_dem=/work/dem.asc',
          '--output=/work/conditioned.asc',
          '--fill_deps=true',
          '--flat_increment=0.001',
        ],
      },
      {
        tool: 'd8_flow_accum',
        args: ['--dem=/work/conditioned.asc', '--output=/work/accum.asc', '--out_type=cells'],
      },
      {
        tool: 'extract_streams',
        args: [
          '--input=/work/accum.asc',
          '--output=/work/streams.asc',
          `--threshold=${streamCells}`,
        ],
      },
      {
        tool: 'elevation_above_stream',
        args: [
          '--input_dem=/work/conditioned.asc',
          '--streams=/work/streams.asc',
          '--output=/work/hand.asc',
        ],
      },
      // Cells whose flow path leaves the grid before meeting a stream get no
      // value above; the nearest stream as the crow flies stands in for them.
      {
        tool: 'elevation_above_stream_euclidean',
        args: [
          '--input_dem=/work/conditioned.asc',
          '--streams=/work/streams.asc',
          '--output=/work/hand_nearest.asc',
        ],
      },
    ],
    { 'dem.asc': grid },
    ['hand.asc', 'hand_nearest.asc'],
  )
  signal.throwIfAborted()

  const hand = out['hand.asc']
  const nearest = out['hand_nearest.asc']
  // Crop the padding back off.
  const viewWidth = cols * TILE_SIZE
  const viewHeight = rows * TILE_SIZE
  const offset = PAD_TILES * TILE_SIZE
  const values = new Float32Array(viewWidth * viewHeight)
  for (let y = 0; y < viewHeight; y++) {
    for (let x = 0; x < viewWidth; x++) {
      const i = (y + offset) * width + x + offset
      let v = hand.values[i]
      if (v === hand.noData) {
        const fallback = nearest.values[i]
        // Below the nearest stream (an undrained pit): floods first.
        v = fallback === nearest.noData ? NaN : Math.max(0, fallback)
      }
      values[y * viewWidth + x] = v
    }
  }

  const west = tileLon(x0, z)
  const east = tileLon(x0 + cols, z)
  const north = tileLat(y0, z)
  const south = tileLat(y0 + rows, z)
  return {
    width: viewWidth,
    height: viewHeight,
    values,
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    cellSizeM,
    zoom: z,
  }
}

// Water depth classes for the map and its legend, shallow to deep.
export const DEPTH_CLASSES: { min: number; label: string; rgb: [number, number, number] }[] = [
  { min: 0, label: '< 1 m', rgb: [158, 202, 225] },
  { min: 1, label: '1–2 m', rgb: [107, 174, 214] },
  { min: 2, label: '2–4 m', rgb: [49, 130, 189] },
  { min: 4, label: '4 m +', rgb: [8, 69, 148] },
]

const rgbCss = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`
export const depthLegend = DEPTH_CLASSES.map((c) => ({ label: c.label, color: rgbCss(c.rgb) }))

/**
 * Paints the cells under `level` metres of water, shaded by depth, and returns
 * the image as a data URL for a maplibre image source.
 */
export function renderFloodDepth(
  flood: FloodDepth,
  level: number,
  canvas: HTMLCanvasElement,
): string {
  canvas.width = flood.width
  canvas.height = flood.height
  const context = canvas.getContext('2d')!
  const image = context.createImageData(flood.width, flood.height)
  const { data } = image
  for (let i = 0; i < flood.values.length; i++) {
    const depth = level - flood.values[i]
    // NaN fails this too, leaving uncomputed cells clear.
    if (!(depth > 0)) continue
    let k = DEPTH_CLASSES.length - 1
    while (k > 0 && depth < DEPTH_CLASSES[k].min) k--
    const [r, g, b] = DEPTH_CLASSES[k].rgb
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

// Share of computed cells under `level` metres of water, and that area in km².
export function floodedArea(flood: FloodDepth, level: number): { share: number; km2: number } {
  let wet = 0
  let valid = 0
  for (const v of flood.values) {
    if (Number.isNaN(v)) continue
    valid++
    if (v < level) wet++
  }
  return { share: valid ? wet / valid : 0, km2: (wet * flood.cellSizeM ** 2) / 1e6 }
}
