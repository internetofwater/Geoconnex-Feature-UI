import { useState } from 'react'
import { useExplorer } from '../state/ExplorerContext'
import { NodeDetails } from './NodeDetails'
import { SitemapsList } from './SitemapsList'
import { SparqlTab } from './SparqlTab'

type Tab = 'details' | 'sparql' | 'sitemaps'

export function NodePanel() {
  const { selectedNode, clearNode } = useExplorer()
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<Tab>('details')

  if (!selectedNode) return null

  if (collapsed) {
    return (
      <button
        type="button"
        className="side-panel-toggle node-panel-toggle-collapsed"
        onClick={() => setCollapsed(false)}
        aria-label="Expand panel"
        title="Expand panel"
      >
        «
      </button>
    )
  }

  return (
    <aside className="node-panel">
      <div className="node-panel-controls">
        <button
          type="button"
          className="side-panel-toggle"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse panel"
          title="Collapse panel"
        >
          »
        </button>
        <button
          type="button"
          className="side-panel-toggle"
          onClick={clearNode}
          aria-label="Close"
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="side-panel-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'details'}
          className={tab === 'details' ? 'active' : ''}
          onClick={() => setTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sparql'}
          className={tab === 'sparql' ? 'active' : ''}
          onClick={() => setTab('sparql')}
        >
          SPARQL
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sitemaps'}
          className={tab === 'sitemaps' ? 'active' : ''}
          onClick={() => setTab('sitemaps')}
        >
          Sitemaps
        </button>
      </div>

      {tab === 'sparql' ? (
        <SparqlTab nodeUri={selectedNode} />
      ) : tab === 'sitemaps' ? (
        <SitemapsList />
      ) : (
        <NodeDetails />
      )}
    </aside>
  )
}
