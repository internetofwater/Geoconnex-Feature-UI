export function buildOneHopQuery(nodeUri: string): string {
  return `SELECT ?p ?other ?dir WHERE {
  { <${nodeUri}> ?p ?other . BIND("out" AS ?dir) }
  UNION
  { ?other ?p <${nodeUri}> . BIND("in" AS ?dir) }
} LIMIT 500`
}
