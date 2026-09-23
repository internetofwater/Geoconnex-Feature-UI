import { useState } from 'react'
import { useExplorer } from '../state/ExplorerContext'
import { MainstemSummary } from './MainstemSummary'
import { SearchTab } from './SearchTab'

type Tab = 'explore' | 'search'

export function SidePanel() {
  const { selectedMainstem } = useExplorer()
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<Tab>('explore')

  if (collapsed) {
    return (
      <button
        type="button"
        className="side-panel-toggle side-panel-toggle-collapsed"
        onClick={() => setCollapsed(false)}
        aria-label="Expand panel"
        title="Expand panel"
      >
        »
      </button>
    )
  }

  return (
    <aside className="side-panel">
      <button
        type="button"
        className="side-panel-toggle"
        onClick={() => setCollapsed(true)}
        aria-label="Collapse panel"
        title="Collapse panel"
      >
        «
      </button>

      <div className="side-panel-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'explore'}
          className={tab === 'explore' ? 'active' : ''}
          onClick={() => setTab('explore')}
        >
          Explore
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'search'}
          className={tab === 'search' ? 'active' : ''}
          onClick={() => setTab('search')}
        >
          Search
        </button>
      </div>

      {tab === 'search' ? (
        <SearchTab />
      ) : selectedMainstem ? (
        <MainstemSummary />
      ) : (
        <div className="side-panel-empty">
          <h1>Geoconnex Explorer</h1>
          <p>
            Click a river on the map to see the features linked to it in the Geoconnex graph.
            Click any feature to open its raw RDF neighborhood, one hop at a time.
          </p>
        </div>
      )}
    </aside>
  )
}
