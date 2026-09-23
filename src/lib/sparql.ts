import type { SparqlJsonResults } from './types'

export const QLEVER_ENDPOINT = 'https://qlever.internetofwater.app/api/geoconnex'

export async function runSparqlQuery(
  query: string,
  signal?: AbortSignal,
): Promise<SparqlJsonResults> {
  const url = new URL(QLEVER_ENDPOINT)
  url.searchParams.set('query', query)

  const response = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json' },
    signal,
  })

  if (!response.ok) {
    throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<SparqlJsonResults>
}
