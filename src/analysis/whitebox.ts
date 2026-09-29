import type { FeatureCollection } from 'geojson'
import type { Grid, WhiteboxRequest, WhiteboxResponse, WhiteboxStep } from './whitebox.worker'

export type { Grid } from './whitebox.worker'

// One worker for the session, created on first use: the tool binary is ~18 MB
// and only people who open the Analysis tab should pay for it.
let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (response: WhiteboxResponse) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./whitebox.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WhiteboxResponse>) => {
      pending.get(event.data.id)?.(event.data)
      pending.delete(event.data.id)
    }
  }
  return worker
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function run(
  request: Omit<WhiteboxRequest, 'id'>,
): Promise<Extract<WhiteboxResponse, { ok: true }>> {
  const id = nextId++
  const response = await new Promise<WhiteboxResponse>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({ ...request, id })
  })
  if (!response.ok) throw new Error(response.error)
  if (response.exitCode !== 0) {
    throw new Error(
      response.stdout.find((line) => line.includes('ERROR')) ??
        `${response.failedTool ?? 'Whitebox'} failed`,
    )
  }
  return response
}

/**
 * Runs one WhiteboxTools tool on a GeoJSON input and returns its GeoJSON
 * output. Inputs are passed in Web Mercator (EPSG:3857, via a `crs` member) so
 * distance parameters are in metres; whitebox writes its output back as WGS84.
 */
export async function runVectorTool(
  tool: string,
  input: FeatureCollection,
  args: (inputPath: string, outputPath: string) => string[],
): Promise<FeatureCollection> {
  const response = await run({
    steps: [{ tool, args: args('/work/input.geojson', '/work/output.geojson') }],
    input: { 'input.geojson': encoder.encode(JSON.stringify(input)) },
  })
  const output = response.files['output.geojson']
  if (!output) throw new Error(`${tool} failed`)
  return JSON.parse(decoder.decode(output)) as FeatureCollection
}

/**
 * Runs a chain of raster tools over `grids` (written to /work as `<name>`, so
 * name them `*.asc`) and returns the `outputs` grids. Steps share /work, so a
 * later step can read an earlier one's output by its path.
 */
export async function runRasterPipeline(
  steps: WhiteboxStep[],
  grids: Record<string, Grid>,
  outputs: string[],
): Promise<Record<string, Grid>> {
  const response = await run({ steps, input: {}, grids, outputGrids: outputs })
  for (const name of outputs) {
    if (!response.grids[name]) throw new Error(`Whitebox didn't produce ${name}`)
  }
  return response.grids
}
