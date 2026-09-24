// Runs WhiteboxTools in a worker: a tool executes synchronously inside WASI, so
// on the main thread even a few seconds of buffering would freeze the map.
import { initTools, runTool } from 'whitebox-wasm/tools'
// The package doesn't export its wasm files, so reference the bundled binary by
// path; letting tools.mjs resolve it from import.meta.url breaks once bundled.
import cliWasmUrl from '../../node_modules/whitebox-wasm/whitebox-cli.wasm?url'

export interface WhiteboxRequest {
  id: number
  tool: string
  args: string[]
  input: Record<string, Uint8Array>
}

export type WhiteboxResponse =
  | { id: number; ok: true; exitCode: number; stdout: string[]; files: Record<string, Uint8Array> }
  | { id: number; ok: false; error: string }

const ready = initTools(cliWasmUrl)

self.onmessage = async (event: MessageEvent<WhiteboxRequest>) => {
  const { id, tool, args, input } = event.data
  try {
    await ready
    const { exitCode, stdout, files } = await runTool(tool, { args, input })
    const response: WhiteboxResponse = { id, ok: true, exitCode, stdout, files }
    self.postMessage(response, { transfer: Object.values(files).map((f) => f.buffer) })
  } catch (error) {
    const response: WhiteboxResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}
