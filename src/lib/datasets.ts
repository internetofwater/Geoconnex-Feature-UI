import { csvField } from './rdf'
import { runSparqlQuery } from './sparql'
import type { SparqlBindingValue } from './types'

// Mirrors the node shapes in the canonical Geoconnex SHACL shape
// (https://docs.geoconnex.us/reference/data-formats/shacl_shape), which is what
// every `schema:subjectOf` dataset is validated against on ingest. Properties are
// listed in the shape's own order; `shape` marks a property whose value is a
// nested node validated by another node shape.

export const SCHEMA = 'https://schema.org/'
const DCTERMS = 'http://purl.org/dc/terms/'

export interface ShapeProperty {
  path: string
  label: string
  required?: boolean
  shape?: NodeShape
}

export interface NodeShape {
  label: string
  properties: ShapeProperty[]
}

export const MEASUREMENT_METHOD_SHAPE: NodeShape = {
  label: 'Measurement method',
  properties: [
    { path: `${SCHEMA}name`, label: 'Name', required: true },
    { path: `${SCHEMA}description`, label: 'Description' },
    { path: `${SCHEMA}url`, label: 'URL' },
  ],
}

export const VARIABLE_SHAPE: NodeShape = {
  label: 'Variable measured',
  properties: [
    { path: `${SCHEMA}name`, label: 'Name', required: true },
    { path: `${SCHEMA}description`, label: 'Description' },
    { path: `${SCHEMA}propertyID`, label: 'Property ID' },
    { path: `${SCHEMA}url`, label: 'URL' },
    { path: `${SCHEMA}unitText`, label: 'Unit' },
    { path: 'http://qudt.org/schema/qudt/hasQuantityKind', label: 'Quantity kind' },
    { path: `${SCHEMA}unitCode`, label: 'Unit code' },
    { path: `${SCHEMA}measurementTechnique`, label: 'Measurement technique' },
    {
      path: `${SCHEMA}measurementMethod`,
      label: 'Measurement method',
      shape: MEASUREMENT_METHOD_SHAPE,
    },
  ],
}

export const PROVIDER_SHAPE: NodeShape = {
  label: 'Provider',
  properties: [
    { path: `${SCHEMA}name`, label: 'Name', required: true },
    { path: `${SCHEMA}url`, label: 'URL' },
  ],
}

export const PUBLISHER_SHAPE: NodeShape = {
  label: 'Publisher',
  properties: [
    { path: `${SCHEMA}name`, label: 'Name', required: true },
    { path: `${SCHEMA}email`, label: 'Email', required: true },
    { path: `${SCHEMA}url`, label: 'URL' },
  ],
}

export const DISTRIBUTION_SHAPE: NodeShape = {
  label: 'Distribution',
  properties: [
    { path: `${SCHEMA}name`, label: 'Name' },
    { path: `${SCHEMA}contentUrl`, label: 'Content URL', required: true },
    { path: `${SCHEMA}encodingFormat`, label: 'Format' },
    { path: `${DCTERMS}conformsTo`, label: 'Conforms to' },
  ],
}

export const DATASET_SHAPE: NodeShape = {
  label: 'Dataset',
  properties: [
    { path: `${SCHEMA}identifier`, label: 'Identifier' },
    { path: `${SCHEMA}name`, label: 'Name', required: true },
    { path: `${SCHEMA}description`, label: 'Description' },
    { path: `${SCHEMA}provider`, label: 'Provider', required: true, shape: PROVIDER_SHAPE },
    { path: `${SCHEMA}publisher`, label: 'Publisher', shape: PUBLISHER_SHAPE },
    { path: `${SCHEMA}creator`, label: 'Creator' },
    { path: `${SCHEMA}keywords`, label: 'Keywords' },
    { path: `${SCHEMA}license`, label: 'License' },
    { path: `${SCHEMA}isAccessibleForFree`, label: 'Free to access' },
    { path: `${SCHEMA}distribution`, label: 'Distribution', shape: DISTRIBUTION_SHAPE },
    { path: `${SCHEMA}variableMeasured`, label: 'Variable measured', shape: VARIABLE_SHAPE },
    { path: `${SCHEMA}temporalCoverage`, label: 'Temporal coverage' },
    { path: `${DCTERMS}accrualPeriodicity`, label: 'Update frequency' },
    { path: `${SCHEMA}about`, label: 'About' },
  ],
}

// schema:url is not part of DatasetShape (the shape is open), but nearly every
// dataset carries one and it's the natural target for the dataset's name link.
export const DATASET_URL_PATH = `${SCHEMA}url`

export type PropertyValues = Map<string, SparqlBindingValue[]>

/** Every subject's property values, keyed by subject IRI. */
export type NodeIndex = Map<string, PropertyValues>

export interface DatasetSummary {
  id: string
  values: PropertyValues
  /** Only name and unit — enough for the summary table; the rest loads on expand. */
  variables: PropertyValues[]
}

export function firstValue(values: PropertyValues, path: string): string | undefined {
  return values.get(path)?.[0]?.value
}

export function variableLabel(dataset: DatasetSummary): string | undefined {
  const labels = dataset.variables.flatMap((variable) => {
    const name = firstValue(variable, `${SCHEMA}name`)
    if (!name) return []
    const unit = firstValue(variable, `${SCHEMA}unitText`)
    return unit ? [`${name} (${unit})`] : [name]
  })
  return labels.length ? labels.join(', ') : undefined
}

/** The summary table's columns only — not the per-dataset detail. */
export function datasetsToCsv(datasets: DatasetSummary[]): string {
  const lines = ['name,description,url,variable,temporal_coverage']
  for (const dataset of datasets) {
    lines.push(
      [
        firstValue(dataset.values, `${SCHEMA}name`) ?? '',
        firstValue(dataset.values, `${SCHEMA}description`) ?? '',
        firstValue(dataset.values, DATASET_URL_PATH) ?? '',
        variableLabel(dataset) ?? '',
        firstValue(dataset.values, `${SCHEMA}temporalCoverage`) ?? '',
      ]
        .map(csvField)
        .join(','),
    )
  }
  return lines.join('\r\n')
}

function addValue(index: NodeIndex, subject: string, path: string, value: SparqlBindingValue) {
  let values = index.get(subject)
  if (!values) {
    values = new Map()
    index.set(subject, values)
  }
  const existing = values.get(path)
  if (!existing) {
    values.set(path, [value])
  } else if (!existing.some((v) => v.value === value.value)) {
    existing.push(value)
  }
}

async function fetchTriples(query: string, signal: AbortSignal): Promise<NodeIndex> {
  const results = await runSparqlQuery(query, signal)
  const index: NodeIndex = new Map()
  for (const row of results.results.bindings) {
    if (row.s && row.p && row.o) addValue(index, row.s.value, row.p.value, row.o)
  }
  return index
}

// Each query is a single hop from a fixed IRI: QLever answers these in a second or
// two even for features with ~1000 datasets, whereas OPTIONAL-heavy aggregates over
// the same data time out. Nested nodes are also frequently merged in the graph
// (one provider node can carry dozens of names), so the summary deliberately
// avoids providers and publishers and leaves them for the per-dataset detail.

function datasetTriplesQuery(featureUri: string): string {
  return `PREFIX schema: <${SCHEMA}>
SELECT ?s ?p ?o WHERE {
  <${featureUri}> schema:subjectOf ?s .
  ?s ?p ?o .
}`
}

function variableSummaryQuery(featureUri: string): string {
  return `PREFIX schema: <${SCHEMA}>
SELECT ?s ?p ?o WHERE {
  <${featureUri}> schema:subjectOf/schema:variableMeasured ?s .
  VALUES ?p { schema:name schema:unitText }
  ?s ?p ?o .
}`
}

function datasetDetailQuery(datasetUri: string): string {
  return `PREFIX schema: <${SCHEMA}>
SELECT ?s ?p ?o WHERE {
  {
    <${datasetUri}> ?via ?s .
    VALUES ?via { schema:provider schema:publisher schema:distribution schema:variableMeasured }
    ?s ?p ?o .
  }
  UNION
  {
    <${datasetUri}> schema:variableMeasured/schema:measurementMethod ?s .
    ?s ?p ?o .
  }
}`
}

export async function fetchDatasetSummaries(
  featureUri: string,
  signal: AbortSignal,
): Promise<DatasetSummary[]> {
  const [datasets, variables] = await Promise.all([
    fetchTriples(datasetTriplesQuery(featureUri), signal),
    fetchTriples(variableSummaryQuery(featureUri), signal),
  ])

  const summaries: DatasetSummary[] = []
  for (const [id, values] of datasets) {
    const variableIds = values.get(`${SCHEMA}variableMeasured`) ?? []
    summaries.push({
      id,
      values,
      variables: variableIds.flatMap((v) => variables.get(v.value) ?? []),
    })
  }

  const sortKey = (d: DatasetSummary) =>
    `${d.variables[0] ? firstValue(d.variables[0], `${SCHEMA}name`) : ''}\u0000${firstValue(d.values, `${SCHEMA}name`) ?? ''}`
  return summaries.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
}

export function fetchDatasetDetail(datasetUri: string, signal: AbortSignal): Promise<NodeIndex> {
  return fetchTriples(datasetDetailQuery(datasetUri), signal)
}
