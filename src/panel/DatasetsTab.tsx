import { Fragment, useState } from 'react'
import {
  DATASET_SHAPE,
  DATASET_URL_PATH,
  fetchDatasetDetail,
  datasetsToCsv,
  firstValue,
  SCHEMA,
  type DatasetSummary,
  type NodeIndex,
  type NodeShape,
  type PropertyValues,
  variableLabel,
} from '../lib/datasets'
import { downloadCsv, slugify } from '../lib/download'
import type { SparqlBindingValue } from '../lib/types'
import { useExplorer } from '../state/ExplorerContext'
import { useAsyncResource } from '../state/useAsyncResource'
import { DownloadIcon } from './DownloadIcon'

const INITIAL_ROWS = 100
const INITIAL_VALUES = 3

export function DatasetsTab({
  expanded,
  onToggle,
}: {
  expanded: ReadonlySet<string>
  onToggle: (datasetId: string) => void
}) {
  const { datasetsResource, selectedNode } = useExplorer()
  const [showAll, setShowAll] = useState(false)

  if (datasetsResource.status === 'loading') {
    return (
      <p className="panel-status panel-status-loading">
        <span className="spinner" aria-hidden="true" />
        Looking for datasets…
      </p>
    )
  }
  if (datasetsResource.status === 'error') {
    return <p className="panel-status panel-status-error">{datasetsResource.error}</p>
  }

  const datasets = datasetsResource.data ?? []
  if (datasets.length === 0) {
    return <p className="panel-status">This feature has no associated datasets.</p>
  }

  const visible = showAll ? datasets : datasets.slice(0, INITIAL_ROWS)

  return (
    <div className="datasets-tab">
      <div className="panel-header-row">
        <p className="panel-status">
          Subject of {datasets.length.toLocaleString()}{' '}
          {datasets.length === 1 ? 'Dataset' : 'Datasets'}
        </p>
        <button
          type="button"
          className="icon-button"
          onClick={() =>
            downloadCsv(
              datasetsToCsv(datasets),
              `${slugify(selectedNode?.split('/').filter(Boolean).at(-1) ?? '') || 'feature'}-datasets.csv`,
            )
          }
          aria-label="Download datasets as CSV"
          title="Download datasets as CSV"
        >
          <DownloadIcon />
        </button>
      </div>
      <table className="dataset-table">
        <thead>
          <tr>
            <th aria-label="Expand" />
            <th>Dataset</th>
            <th>Variable</th>
            <th>Coverage</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((dataset) => {
            const isOpen = expanded.has(dataset.id)
            return (
              <Fragment key={dataset.id}>
                <tr
                  className={isOpen ? 'dataset-row open' : 'dataset-row'}
                  onClick={(event) => {
                    // Let the dataset's own link open without also toggling the row.
                    if ((event.target as HTMLElement).closest('a')) return
                    onToggle(dataset.id)
                  }}
                >
                  <td>
                    <button
                      type="button"
                      className="dataset-row-toggle"
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Collapse dataset' : 'Expand dataset'}
                    >
                      {isOpen ? '▾' : '▸'}
                    </button>
                  </td>
                  <td>
                    <DatasetName dataset={dataset} />
                  </td>
                  <td>{variableLabel(dataset) ?? <span className="shape-empty">—</span>}</td>
                  <td className="dataset-coverage">
                    {formatCoverage(firstValue(dataset.values, `${SCHEMA}temporalCoverage`))}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="dataset-detail-row">
                    <td colSpan={4}>
                      <DatasetDetail dataset={dataset} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {!showAll && datasets.length > INITIAL_ROWS && (
        <button type="button" className="show-more-button" onClick={() => setShowAll(true)}>
          Show all {datasets.length.toLocaleString()} datasets
        </button>
      )}
    </div>
  )
}

function DatasetName({ dataset }: { dataset: DatasetSummary }) {
  const name = firstValue(dataset.values, `${SCHEMA}name`) ?? 'Unnamed dataset'
  const url = firstValue(dataset.values, DATASET_URL_PATH)
  const description = firstValue(dataset.values, `${SCHEMA}description`)
  return (
    <>
      {url && isHttpUrl(url) ? (
        <a href={url} target="_blank" rel="noreferrer">
          {name}
        </a>
      ) : (
        name
      )}
      {description && <span className="dataset-description">{description}</span>}
    </>
  )
}

// The shape requires ISO 8601 intervals: DATE/DATE, ../DATE or DATE/.. — show
// just the dates and spell out the open ends.
function formatCoverage(coverage: string | undefined) {
  if (!coverage) return <span className="shape-empty">—</span>
  const [start, end] = coverage.split('/')
  if (end === undefined) return coverage
  const day = (value: string) => value.split('T')[0]
  const from = start === '..' ? 'unknown' : day(start)
  const to = end === '..' ? 'ongoing' : day(end)
  return `${from} – ${to}`
}

function DatasetDetail({ dataset }: { dataset: DatasetSummary }) {
  const detail = useAsyncResource(dataset.id, fetchDatasetDetail)
  return (
    <div className="dataset-detail">
      {detail.status === 'error' && (
        <p className="panel-status panel-status-error">{detail.error}</p>
      )}
      <ShapeTable
        shape={DATASET_SHAPE}
        values={dataset.values}
        index={detail.data ?? new Map()}
        nestedLoading={detail.status === 'loading'}
      />
    </div>
  )
}

function ShapeTable({
  shape,
  values,
  index,
  nestedLoading,
}: {
  shape: NodeShape
  values: PropertyValues
  index: NodeIndex
  nestedLoading: boolean
}) {
  const rows = shape.properties.filter((property) => values.has(property.path) || property.required)
  if (rows.length === 0) return <span className="shape-empty">No values</span>

  return (
    <dl className="shape-grid">
      {rows.map((property) => {
        const propertyValues = values.get(property.path) ?? []
        return (
          <Fragment key={property.path}>
            <dt>{property.label}</dt>
            <dd>
              {propertyValues.length === 0 ? (
                <span className="shape-missing">Missing — required by the Geoconnex shape</span>
              ) : property.shape ? (
                <NestedNodes
                  shape={property.shape}
                  ids={propertyValues}
                  index={index}
                  nestedLoading={nestedLoading}
                />
              ) : (
                <ValueList values={propertyValues} />
              )}
            </dd>
          </Fragment>
        )
      })}
    </dl>
  )
}

function NestedNodes({
  shape,
  ids,
  index,
  nestedLoading,
}: {
  shape: NodeShape
  ids: SparqlBindingValue[]
  index: NodeIndex
  nestedLoading: boolean
}) {
  if (nestedLoading) return <span className="shape-empty">Loading…</span>
  return (
    <div className="shape-nested-list">
      {ids.map((id) => {
        const nodeValues = index.get(id.value)
        // A plain literal or an IRI with no triples of its own (e.g. a publisher
        // given as a bare string) has nothing to nest — show it as-is.
        if (!nodeValues) return <ValueList key={id.value} values={[id]} />
        return (
          <ShapeTable
            key={id.value}
            shape={shape}
            values={nodeValues}
            index={index}
            nestedLoading={nestedLoading}
          />
        )
      })}
    </div>
  )
}

function ValueList({ values }: { values: SparqlBindingValue[] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? values : values.slice(0, INITIAL_VALUES)
  return (
    <span className="shape-values">
      {visible.map((value) => (
        <span key={value.value} className="shape-value">
          {isHttpUrl(value.value) ? (
            <a href={value.value} target="_blank" rel="noreferrer">
              {value.value}
            </a>
          ) : (
            value.value
          )}
        </span>
      ))}
      {!showAll && values.length > INITIAL_VALUES && (
        <button type="button" className="shape-more" onClick={() => setShowAll(true)}>
          +{values.length - INITIAL_VALUES} more
        </button>
      )}
    </span>
  )
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}
