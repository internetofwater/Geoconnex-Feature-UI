import type { GraphFeature, SparqlBinding, SparqlBindingValue, TripleRow } from './types'

const KNOWN_PREFIXES: Record<string, string> = {
  'https://schema.org/': 'schema',
  'http://www.opengis.net/ont/geosparql#': 'gsp',
  'https://www.opengis.net/def/schema/hy_features/hyf/': 'hyf',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#': 'rdf',
  'http://www.w3.org/2000/01/rdf-schema#': 'rdfs',
  'http://www.w3.org/2001/XMLSchema#': 'xsd',
  'http://www.w3.org/2004/02/skos/core#': 'skos',
  'http://www.w3.org/ns/dcat#': 'dcat',
  'http://purl.org/dc/terms/': 'dcterms',
  'http://www.w3.org/ns/prov#': 'prov',
  'http://www.w3.org/ns/sosa/': 'sosa',
  'http://www.w3.org/ns/ssn/': 'ssn',
  'https://geoconnex.us/ref/': 'geoconnex',
  'https://www.wikidata.org/wiki/Property:': 'wikidata',
}

export function compactUri(uri: string): string {
  for (const [namespace, prefix] of Object.entries(KNOWN_PREFIXES)) {
    if (uri.startsWith(namespace)) {
      return `${prefix}:${uri.slice(namespace.length)}`
    }
  }
  try {
    const url = new URL(uri)
    const segments = url.pathname.split('/').filter(Boolean)
    const last = segments.at(-1)
    return last ? `${url.hostname}/…/${last}` : uri
  } catch {
    return uri
  }
}

export function toTripleRows(bindings: SparqlBinding[]): TripleRow[] {
  const rows: TripleRow[] = []
  for (const row of bindings) {
    const predicate = row.p?.value
    const other = row.other
    const direction = row.dir?.value
    if (!predicate || !other || (direction !== 'out' && direction !== 'in')) continue
    rows.push({ predicate, other, direction })
  }
  return rows
}

export function formatLiteralValue(value: SparqlBindingValue): string {
  if (value.type !== 'literal') return value.value
  if (value.datatype && !value.datatype.endsWith('#string')) {
    const compactType = compactUri(value.datatype)
    return `${value.value} (${compactType})`
  }
  if (value['xml:lang']) {
    return `${value.value} @${value['xml:lang']}`
  }
  return value.value
}

export function tripleRowsToCsv(rows: TripleRow[]): string {
  const header = ['direction', 'predicate', 'value', 'value_type']
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(
      [row.direction, row.predicate, row.other.value, row.other.type].map(csvField).join(','),
    )
  }
  return lines.join('\r\n')
}

export function featuresToCsv(features: GraphFeature[]): string {
  const lines = ['feature,iri']
  for (const feature of features) {
    lines.push([feature.name ?? '', feature.uri].map(csvField).join(','))
  }
  return lines.join('\r\n')
}

export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
