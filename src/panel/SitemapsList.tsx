import { useExplorer } from '../state/ExplorerContext'

export function SitemapsList() {
  const { sitemapEntriesResource, sitemapColorScale } = useExplorer()

  return (
    <div className="sitemaps-list">
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
              {/* The plain-language description leads; the id is for reference. */}
              <span className="legend-text">
                <span className="legend-label">{entry.description || entry.id}</span>
                {entry.description && <span className="legend-id">{entry.id}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
