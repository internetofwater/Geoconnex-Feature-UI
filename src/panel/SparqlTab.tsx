import { useState } from 'react'
import { buildOneHopQuery } from '../lib/queries'
import { QLEVER_ENDPOINT } from '../lib/sparql'

export function SparqlTab({ nodeUri }: { nodeUri: string }) {
  const [copied, setCopied] = useState(false)
  const query = buildOneHopQuery(nodeUri)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(query)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — the query
      // is still fully visible and selectable in the <pre> below either way.
    }
  }

  return (
    <div className="sparql-tab">
      <p className="sparql-endpoint">
        Endpoint: <code>{QLEVER_ENDPOINT}</code>
      </p>
      <button type="button" className="sparql-copy-button" onClick={handleCopy}>
        {copied ? 'Copied ✓' : 'Copy query'}
      </button>
      <pre className="sparql-query">
        <code>{query}</code>
      </pre>
    </div>
  )
}
