import { useState } from 'react'
import { FEATURES_COLLECTION_URL } from '../lib/features'
import { buildDatasetsQuery, buildMainstemLocationsQuery, buildOneHopQuery } from '../lib/queries'
import { QLEVER_ENDPOINT } from '../lib/sparql'

const REFERENCE_SERVER = 'https://reference.geoconnex.us'
// Reference features are minted as https://geoconnex.us/ref/<collection>/<id> and
// served by pygeoapi at reference.geoconnex.us/collections/<collection>/items/<id>.
const REFERENCE_URI = /^https:\/\/geoconnex\.us\/ref\/([^/]+)\/([^/?#]+)$/

interface Snippet {
  title: string
  description: string
  code: string
  // A URL that returns the result directly in the browser, when there is one.
  href?: string
}

function featuresUrl(params: Record<string, string>): string {
  const url = new URL(`${FEATURES_COLLECTION_URL}/items`)
  url.search = new URLSearchParams(params).toString()
  return url.toString()
}

function ogcSnippets(nodeUri: string): Snippet[] {
  const snippets: Snippet[] = []
  // Feature ids are full URIs, so they have to be percent-encoded as a path segment.
  const byId = `${FEATURES_COLLECTION_URL}/items/${encodeURIComponent(nodeUri)}?f=json`
  snippets.push({
    title: 'This feature',
    description: 'Look up the feature and its geometry by its id.',
    code: `curl "${byId}"`,
    href: byId,
  })

  const reference = REFERENCE_URI.exec(nodeUri)
  if (reference) {
    const [, collection, id] = reference
    const item = `${REFERENCE_SERVER}/collections/${collection}/items/${id}`
    snippets.push({
      title: 'Reference feature server',
      description: `The ${collection} reference feature, including its full properties. Use f=jsonld for the JSON-LD that the Geoconnex crawler harvests.`,
      code: `curl "${item}?f=json"\ncurl "${item}?f=jsonld"`,
      href: `${item}?f=json`,
    })
    if (collection === 'mainstems') {
      const along = featuresUrl({ mainstem_uri: nodeUri, limit: '1000', f: 'json' })
      snippets.push({
        title: 'Features along this mainstem',
        description: 'All Geoconnex features that reference this mainstem.',
        code: `curl "${along}"`,
        href: along,
      })
    }
  }
  return snippets
}

function sparqlSnippets(nodeUri: string): Snippet[] {
  const snippets: Snippet[] = [
    {
      title: 'Datasets about this feature',
      description: 'Datasets linked with schema:subjectOf, with the variables they measure.',
      code: buildDatasetsQuery(nodeUri),
    },
    {
      title: 'All properties',
      description: 'Every triple one hop from this feature, in both directions.',
      code: buildOneHopQuery(nodeUri),
    },
  ]
  if (REFERENCE_URI.exec(nodeUri)?.[1] === 'mainstems') {
    snippets.push({
      title: 'Monitoring locations on this mainstem',
      description: 'Locations referenced to this mainstem, with their WKT geometry.',
      code: buildMainstemLocationsQuery(nodeUri),
    })
  }
  return snippets
}

function SnippetBlock({ snippet }: { snippet: Snippet }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — the snippet
      // is still fully visible and selectable in the <pre> below either way.
    }
  }

  return (
    <div className="query-snippet">
      <div className="query-snippet-header">
        <h4>{snippet.title}</h4>
        <div className="query-snippet-actions">
          {snippet.href && (
            <a href={snippet.href} target="_blank" rel="noreferrer">
              Open
            </a>
          )}
          <button type="button" onClick={handleCopy}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
      </div>
      <p className="query-snippet-description">{snippet.description}</p>
      <pre className="sparql-query">
        <code>{snippet.code}</code>
      </pre>
    </div>
  )
}

function QuerySection({
  title,
  endpoint,
  snippets,
  defaultOpen,
}: {
  title: string
  endpoint: string
  snippets: Snippet[]
  defaultOpen?: boolean
}) {
  return (
    <details className="query-section" open={defaultOpen}>
      <summary>{title}</summary>
      <p className="sparql-endpoint">
        Endpoint: <code>{endpoint}</code>
      </p>
      {snippets.map((snippet) => (
        <SnippetBlock key={snippet.title} snippet={snippet} />
      ))}
    </details>
  )
}

export function QueryingTab({ nodeUri }: { nodeUri: string }) {
  return (
    <div className="querying-tab">
      <QuerySection
        title="OGC API Features"
        endpoint={FEATURES_COLLECTION_URL}
        snippets={ogcSnippets(nodeUri)}
        defaultOpen
      />
      <QuerySection title="SPARQL" endpoint={QLEVER_ENDPOINT} snippets={sparqlSnippets(nodeUri)} />
    </div>
  )
}
