import { useExplorer } from '../state/ExplorerContext'

export function SitemapsList() {
  const { sitemapEntriesResource, sitemapColorScale } = useExplorer()

  return (
    <div className="sitemaps-list">
      <p className="panel-status">
        Every Geoconnex data source has its own color, stable across the map, search results,
        and feature lists.
      </p>

      {sitemapEntriesResource.status === 'loading' && (
        <p className="panel-status">Loading sources…</p>
      )}
      {sitemapEntriesResource.status === 'error' && (
        <p className="panel-status panel-status-error">{sitemapEntriesResource.error}</p>
      )}
      {sitemapEntriesResource.status === 'success' && sitemapEntriesResource.data && (
        <ul className="legend">
          {sitemapEntriesResource.data.map((entry) => (
            <li key={entry.id}>
              <span
                className="legend-swatch"
                style={{ backgroundColor: sitemapColorScale.get(entry.id) }}
              />
              <span className="legend-text">
                <span className="legend-label">{entry.id}</span>
                {entry.description && (
                  <span className="legend-description">{entry.description}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
