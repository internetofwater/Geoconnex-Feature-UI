// Runs WhiteboxTools in a worker: a tool executes synchronously inside WASI, so
// on the main thread even a few seconds of buffering would freeze the map.
import { initTools, runTool } from 'whitebox-wasm/tools'
// The package doesn't export its wasm files, so reference the bundled binary by
// path; letting tools.mjs resolve it from import.meta.url breaks once bundled.
import cliWasmUrl from '../../node_modules/whitebox-wasm/whitebox-cli.wasm?url'

/**
 * A single-band raster. Passed to and from whitebox as an Esri ASCII grid,
 * which it reads and writes natively, so no GeoTIFF codec is needed here.
 */
export interface Grid {
  width: number
  height: number
  // Lower-left corner and square cell size, in the grid's CRS units.
  xll: number
  yll: number
  cellSize: number
  noData: number
  // Row-major from the top row down.
  values: Float32Array
}

export interface WhiteboxStep {
  tool: string
  args: string[]
}

export interface WhiteboxRequest {
  id: number
  // Run in order over one /work directory, so each step sees earlier outputs.
  steps: WhiteboxStep[]
  input: Record<string, Uint8Array>
  // Written to /work as ASCII grids before the first step.
  grids?: Record<string, Grid>
  // Output files to hand back parsed as grids rather than as raw bytes.
  outputGrids?: string[]
}

export type WhiteboxResponse =
  | {
      id: number
      ok: true
      exitCode: number
      // The step that failed, when exitCode is non-zero.
      failedTool?: string
      stdout: string[]
      files: Record<string, Uint8Array>
      grids: Record<string, Grid>
    }
  | { id: number; ok: false; error: string }

const ready = initTools(cliWasmUrl)
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encodeGrid(grid: Grid): Uint8Array {
  const header =
    `ncols ${grid.width}\nnrows ${grid.height}\nxllcorner ${grid.xll}\n` +
    `yllcorner ${grid.yll}\ncellsize ${grid.cellSize}\nNODATA_value ${grid.noData}\n`
  const rows: string[] = []
  for (let y = 0; y < grid.height; y++) {
    const row = grid.values.subarray(y * grid.width, (y + 1) * grid.width)
    rows.push(Array.from(row, (v) => (Number.isNaN(v) ? grid.noData : +v.toFixed(3))).join(' '))
  }
  return encoder.encode(header + rows.join('\n') + '\n')
}

function decodeGrid(bytes: Uint8Array): Grid {
  const text = decoder.decode(bytes)
  const header: Record<string, number> = {}
  let pos = 0
  for (let i = 0; i < 6; i++) {
    const end = text.indexOf('\n', pos)
    const [key, value] = text.slice(pos, end).trim().split(/\s+/)
    header[key.toLowerCase()] = Number(value)
    pos = end + 1
  }
  const width = header.ncols
  const height = header.nrows
  const values = new Float32Array(width * height)
  let i = 0
  for (const token of text.slice(pos).split(/\s+/)) {
    if (token && i < values.length) values[i++] = Number(token)
  }
  return {
    width,
    height,
    xll: header.xllcorner,
    yll: header.yllcorner,
    cellSize: header.cellsize,
    noData: header.nodata_value,
    values,
  }
}

self.onmessage = async (event: MessageEvent<WhiteboxRequest>) => {
  const { id, steps, input, grids = {}, outputGrids = [] } = event.data
  try {
    await ready
    const work: Record<string, Uint8Array> = { ...input }
    for (const [name, grid] of Object.entries(grids)) work[name] = encodeGrid(grid)
    const stdout: string[] = []
    let exitCode = 0
    let failedTool: string | undefined
    for (const step of steps) {
      const result = await runTool(step.tool, { args: step.args, input: work })
      stdout.push(...result.stdout)
      Object.assign(work, result.files)
      exitCode = result.exitCode
      if (exitCode !== 0) {
        failedTool = step.tool
        break
      }
    }
    const files: Record<string, Uint8Array> = {}
    const parsed: Record<string, Grid> = {}
    for (const [name, bytes] of Object.entries(work)) {
      if (name in input || name in grids) continue
      if (outputGrids.includes(name)) parsed[name] = decodeGrid(bytes)
      else files[name] = bytes
    }
    const response: WhiteboxResponse = {
      id,
      ok: true,
      exitCode,
      failedTool,
      stdout,
      files,
      grids: parsed,
    }
    self.postMessage(response, {
      transfer: [
        ...Object.values(files).map((f) => f.buffer),
        ...Object.values(parsed).map((g) => g.values.buffer),
      ],
    })
  } catch (error) {
    const response: WhiteboxResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}
