import { useState, type FormEvent } from 'react'
import { colorForSitemap } from '../lib/colors'
import { normalizeSitemapId } from '../lib/sitemaps'
import { useExplorer } from '../state/ExplorerContext'

export function SearchTab() {
  const {
    selectedNode,
    selectNode,
    flyTo,
    searchResource,
    sitemapEntriesResource,
    sitemapColorScale,
    mapBounds,
    runSearch,
  } = useExplorer()
  const [term, setTerm] = useState('')
  const [sitemapId, setSitemapId] = useState('')
  const [limitToView, setLimitToView] = useState(true)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    runSearch({
      term,
      sitemapId: sitemapId || undefined,
      bbox: limitToView ? (mapBounds ?? undefined) : undefined,
    })
  }

  function openFeature(feature: { uri: string; lon: number; lat: number }) {
    selectNode(feature.uri)
    flyTo(feature.lon, feature.lat)
  }

  const isSearching = searchResource.status === 'loading'

  return (
    <div className="search-tab">
      <form className="search-controls" onSubmit={handleSubmit}>
        <input
          type="search"
          placeholder="Search features by name…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="search-row">
          <select
            value={sitemapId}
            onChange={(e) => setSitemapId(e.target.value)}
            disabled={sitemapEntriesResource.status !== 'success'}
          >
            <option value="">All sources</option>
            {sitemapEntriesResource.data?.map((entry) => (
              <option key={entry.id} value={entry.id} title={entry.description}>
                {entry.id}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!term.trim() || isSearching}>
            {isSearching && <span className="spinner" aria-hidden="true" />}
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </div>
        <label className="search-checkbox">
          <input
            type="checkbox"
            checked={limitToView}
            onChange={(e) => setLimitToView(e.target.checked)}
          />
          Limit to map view
        </label>
      </form>

      {searchResource.status === 'idle' && (
        <p className="panel-status">Type a feature name and press Search.</p>
      )}
      {searchResource.status === 'loading' && (
        <p className="panel-status">Searching — this can take up to a minute…</p>
      )}
      {searchResource.status === 'error' && (
        <p className="panel-status panel-status-error">{searchResource.error}</p>
      )}
      {searchResource.status === 'success' && searchResource.data?.length === 0 && (
        <p className="panel-status">No features matched.</p>
      )}
      {searchResource.status === 'success' &&
        searchResource.data &&
        searchResource.data.length > 0 && (
          <ul className="feature-list">
            {searchResource.data.map((feature) => (
              <li key={feature.uri}>
                <button
                  type="button"
                  className={feature.uri === selectedNode ? 'active' : ''}
                  onClick={() => openFeature(feature)}
                >
                  <span
                    className="feature-list-dot"
                    style={{ backgroundColor: colorForSitemap(feature.sitemap, sitemapColorScale) }}
                  />
                  <span className="feature-list-text">
                    <span className="feature-list-name">{feature.name || feature.uri}</span>
                    {feature.sitemap && (
                      <span className="feature-list-datasets">
                        {normalizeSitemapId(feature.sitemap)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
