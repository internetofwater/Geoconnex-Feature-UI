import { compactUri, formatLiteralValue } from '../lib/rdf'
import type { TripleRow } from '../lib/types'
import { useExplorer } from '../state/ExplorerContext'

export function NodeDetails() {
  const { selectedNode, nodeResource, selectNode } = useExplorer()

  if (!selectedNode) return null

  const outgoing = nodeResource.data?.filter((row) => row.direction === 'out') ?? []
  const incoming = nodeResource.data?.filter((row) => row.direction === 'in') ?? []

  return (
    <div className="node-details">
      <h2 className="node-details-title" title={selectedNode}>
        <a href={selectedNode} target="_blank" rel="noreferrer">
          {compactUri(selectedNode)}
        </a>
      </h2>

      {nodeResource.status === 'loading' && <p className="panel-status">Loading graph edges…</p>}
      {nodeResource.status === 'error' && (
        <p className="panel-status panel-status-error">{nodeResource.error}</p>
      )}

      {nodeResource.status === 'success' && (
        <>
          <TripleTable rows={outgoing} onNavigate={selectNode} />
          <TripleTable
            title={`Referenced by (${incoming.length})`}
            rows={incoming}
            onNavigate={selectNode}
          />
          {outgoing.length === 0 && incoming.length === 0 && (
            <p className="panel-status">No triples found within one hop of this node.</p>
          )}
        </>
      )}
    </div>
  )
}

function TripleTable({
  title,
  rows,
  onNavigate,
}: {
  title?: string
  rows: TripleRow[]
  onNavigate: (uri: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <section className="triple-table-section">
      {title && <h3>{title}</h3>}
      <table className="triple-table">
        <thead>
          <tr>
            <th>Predicate</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.predicate}-${row.other.value}-${index}`}>
              <td title={row.predicate}>{compactUri(row.predicate)}</td>
              <td>
                {row.other.type === 'uri' ? (
                  <button
                    type="button"
                    className="triple-object-link"
                    title={row.other.value}
                    onClick={() => onNavigate(row.other.value)}
                  >
                    {compactUri(row.other.value)}
                  </button>
                ) : (
                  <span title={row.other.value}>{formatLiteralValue(row.other)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
