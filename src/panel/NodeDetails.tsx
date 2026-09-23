import { useState, type ReactNode } from 'react'
import { compactUri, formatLiteralValue, tripleRowsToCsv } from '../lib/rdf'
import type { TripleRow } from '../lib/types'
import { useExplorer } from '../state/ExplorerContext'

function CopyTableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 8.5h9M8.5 5v9" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M11 3V2.5A1.5 1.5 0 0 0 9.5 1h-7A1.5 1.5 0 0 0 1 2.5v7A1.5 1.5 0 0 0 2.5 11H3"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function NodeDetails() {
  const { selectedNode, nodeResource, selectNode } = useExplorer()
  const [copied, setCopied] = useState(false)

  if (!selectedNode) return null

  const outgoing = nodeResource.data?.filter((row) => row.direction === 'out') ?? []
  const incoming = nodeResource.data?.filter((row) => row.direction === 'in') ?? []

  async function handleCopyCsv() {
    if (!nodeResource.data?.length) return
    try {
      await navigator.clipboard.writeText(tripleRowsToCsv(nodeResource.data))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — nothing else
      // to fall back to for a copy-to-clipboard action.
    }
  }

  const copyButton = (
    <button
      type="button"
      className="icon-button"
      onClick={handleCopyCsv}
      aria-label={copied ? 'Copied as CSV' : 'Copy all properties and values as CSV'}
      title={copied ? 'Copied' : 'Copy all properties and values as CSV'}
    >
      {copied ? <CheckIcon /> : <CopyTableIcon />}
    </button>
  )

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
          {/* The export covers both tables, so it sits on whichever renders first. */}
          <TripleTable
            rows={outgoing}
            onNavigate={selectNode}
            headerAction={copyButton}
          />
          <TripleTable
            title={`Referenced by (${incoming.length})`}
            rows={incoming}
            onNavigate={selectNode}
            headerAction={outgoing.length === 0 ? copyButton : undefined}
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
  headerAction,
}: {
  title?: string
  rows: TripleRow[]
  onNavigate: (uri: string) => void
  headerAction?: ReactNode
}) {
  if (rows.length === 0) return null
  return (
    <section className="triple-table-section">
      {title && <h3>{title}</h3>}
      <table className="triple-table">
        <thead>
          <tr>
            <th>Predicate</th>
            <th>
              <span className="triple-table-value-header">
                Value
                {headerAction}
              </span>
            </th>
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
