import { useState } from 'react'
import { useExplorer } from '../state/ExplorerContext'
import { DatasetsTab } from './DatasetsTab'
import { NodeDetails } from './NodeDetails'
import { QueryingTab } from './QueryingTab'

type Tab = 'datasets' | 'properties' | 'querying'

export function NodePanel() {
  const { selectedNode, clearNode, datasetsResource } = useExplorer()
  const [collapsed, setCollapsed] = useState(false)
  // The user's tab choice only sticks for the node it was made on — selecting a
  // new node falls back to that node's default tab.
  const [chosenTab, setChosenTab] = useState<{ node: string; tab: Tab } | null>(null)
  // Expanded dataset rows live here rather than in DatasetsTab so the panel can
  // widen while any are open. Like the tab choice, they're scoped to one node.
  const [expandedDatasets, setExpandedDatasets] = useState<{
    node: string
    ids: ReadonlySet<string>
  } | null>(null)

  if (!selectedNode) return null

  const hasNoDatasets = datasetsResource.status === 'success' && !datasetsResource.data?.length
  // Datasets is the default while the lookup is still running, so a feature that
  // has them doesn't flash its properties first.
  const defaultTab: Tab =
    hasNoDatasets || datasetsResource.status === 'error' ? 'properties' : 'datasets'
  const tab = chosenTab?.node === selectedNode ? chosenTab.tab : defaultTab
  const setTab = (next: Tab) => setChosenTab({ node: selectedNode, tab: next })

  const expandedIds =
    expandedDatasets?.node === selectedNode ? expandedDatasets.ids : new Set<string>()
  const toggleDataset = (id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedDatasets({ node: selectedNode, ids: next })
  }
  const wide = tab === 'datasets' && expandedIds.size > 0

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
    <aside className={wide ? 'node-panel node-panel-wide' : 'node-panel'}>
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
          aria-selected={tab === 'datasets'}
          className={[tab === 'datasets' ? 'active' : '', hasNoDatasets ? 'tab-empty' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('datasets')}
          title={hasNoDatasets ? 'This feature has no linked datasets in the graph' : undefined}
        >
          Datasets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'properties'}
          className={tab === 'properties' ? 'active' : ''}
          onClick={() => setTab('properties')}
        >
          Properties
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'querying'}
          className={tab === 'querying' ? 'active' : ''}
          onClick={() => setTab('querying')}
        >
          Querying
        </button>
      </div>

      {tab === 'querying' ? (
        <QueryingTab nodeUri={selectedNode} />
      ) : tab === 'datasets' ? (
        <DatasetsTab key={selectedNode} expanded={expandedIds} onToggle={toggleDataset} />
      ) : (
        <NodeDetails />
      )}
    </aside>
  )
}
