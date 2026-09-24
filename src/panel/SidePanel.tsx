import { useState } from 'react'
import { useExplorer } from '../state/ExplorerContext'
import { LayersTab } from './LayersTab'
import { AnalysisTab } from './AnalysisTab'
import { MainstemSummary } from './MainstemSummary'
import { MapTab } from './MapTab'
import { SearchTab } from './SearchTab'

type Tab = 'explore' | 'search' | 'layers' | 'map' | 'analysis'

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
        <a
          className="app-logo"
          href="https://internetofwater.org/"
          target="_blank"
          rel="noreferrer"
          title="Internet of Water Coalition"
        >
          <img src={`${import.meta.env.BASE_URL}iowcoalition.png`} alt="Internet of Water Coalition" />
        </a>
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
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'map'}
          className={tab === 'map' ? 'active' : ''}
          onClick={() => setTab('map')}
        >
          Map
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'analysis'}
          className={tab === 'analysis' ? 'active' : ''}
          onClick={() => setTab('analysis')}
        >
          Analysis
        </button>
      </div>

      {tab === 'search' ? (
        <SearchTab />
      ) : tab === 'layers' ? (
        <LayersTab />
      ) : tab === 'map' ? (
        <MapTab />
      ) : tab === 'analysis' ? (
        <AnalysisTab />
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
