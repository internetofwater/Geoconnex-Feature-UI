import { useState } from 'react'
import { useExplorer } from '../state/ExplorerContext'
import { LayersTab } from './LayersTab'
import { MainstemSummary } from './MainstemSummary'
import { SearchTab } from './SearchTab'

type Tab = 'explore' | 'search' | 'layers'

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
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'layers'}
          className={tab === 'layers' ? 'active' : ''}
          onClick={() => setTab('layers')}
        >
          Layers
        </button>
      </div>

      {tab === 'search' ? (
        <SearchTab />
      ) : tab === 'layers' ? (
        <LayersTab />
      ) : selectedMainstem ? (
        <MainstemSummary />
      ) : (
        <div className="side-panel-empty">
          <h1>Geoconnex Features</h1>
          <p>
            Click a river on the map to get started.{' '}
          </p>
        </div>
      )}
    </aside>
  )
}
