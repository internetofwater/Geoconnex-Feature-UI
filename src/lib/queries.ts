export function buildOneHopQuery(nodeUri: string): string {
  return `SELECT ?p ?other ?dir WHERE {
  { <${nodeUri}> ?p ?other . BIND("out" AS ?dir) }
  UNION
  { ?other ?p <${nodeUri}> . BIND("in" AS ?dir) }
} LIMIT 500`
}

export function buildDatasetsQuery(nodeUri: string): string {
  return `PREFIX schema: <https://schema.org/>
SELECT ?dataset ?name ?url ?variable ?unit WHERE {
  <${nodeUri}> schema:subjectOf ?dataset .
  OPTIONAL { ?dataset schema:name ?name }
  OPTIONAL { ?dataset schema:url ?url }
  OPTIONAL {
    ?dataset schema:variableMeasured ?v .
    ?v schema:name ?variable .
    OPTIONAL { ?v schema:unitText ?unit }
  }
} LIMIT 500`
}

export function buildMainstemLocationsQuery(mainstemUri: string): string {
  return `PREFIX hyf: <https://www.opengis.net/def/schema/hy_features/hyf/>
PREFIX gsp: <http://www.opengis.net/ont/geosparql#>
SELECT DISTINCT ?monitoringLocation ?wkt WHERE {
  ?monitoringLocation hyf:referencedPosition/hyf:HY_IndirectPosition/hyf:linearElement <${mainstemUri}> ;
    gsp:hasGeometry/gsp:asWKT ?wkt .
} LIMIT 1000`
}
