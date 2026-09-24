import type { FeatureCollection } from 'geojson'
import type { WhiteboxRequest, WhiteboxResponse } from './whitebox.worker'

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
  const id = nextId++
  const request: WhiteboxRequest = {
    id,
    tool,
    args: args('/work/input.geojson', '/work/output.geojson'),
    input: { 'input.geojson': encoder.encode(JSON.stringify(input)) },
  }
  const response = await new Promise<WhiteboxResponse>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage(request)
  })
  if (!response.ok) throw new Error(response.error)
  const output = response.files['output.geojson']
  if (response.exitCode !== 0 || !output) {
    throw new Error(response.stdout.find((line) => line.includes('ERROR')) ?? `${tool} failed`)
  }
  return JSON.parse(decoder.decode(output)) as FeatureCollection
}
