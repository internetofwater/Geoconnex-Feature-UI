import { colorForSitemap } from '../lib/colors'
import { downloadCsv, slugify } from '../lib/download'
import { featuresToCsv } from '../lib/rdf'
import { useExplorer } from '../state/ExplorerContext'
import { DownloadIcon } from './DownloadIcon'
import { useFeatureFilter } from './FeatureFilter'

function GraphIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <line x1="4" y1="12" x2="12" y2="4" stroke="currentColor" strokeWidth="1.4" />
      <line x1="4" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="4" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

export function MainstemSummary() {
  const { selectedMainstem, selectedNode, mainstemResource, sitemapColorScale, selectNode, flyTo } =
    useExplorer()
  const filter = useFeatureFilter(mainstemResource.data ?? [], selectedMainstem?.uri ?? null)

  if (!selectedMainstem) return null

  return (
    <div className="mainstem-summary">
      <div className="mainstem-header">
        <h2>
          <a href={selectedMainstem.uri} target="_blank" rel="noreferrer">
            {selectedMainstem.name_at_outlet || 'Unnamed mainstem'}
          </a>
        </h2>
        <button
          type="button"
          className="icon-button"
          onClick={() => selectNode(selectedMainstem.uri)}
          aria-label="Inspect raw graph node"
          title="Inspect raw graph node"
        >
          <GraphIcon />
        </button>
      </div>
      <dl className="mainstem-stats">
        <div>
          <dt>Length</dt>
          <dd>{selectedMainstem.lengthkm.toFixed(1)} km</dd>
        </div>
        <div>
          <dt>Drainage area</dt>
          <dd>{selectedMainstem.outlet_drainagearea_sqkm.toLocaleString()} km²</dd>
        </div>
      </dl>

      <div className="panel-header-row">
        <h3>Associated features</h3>
        {mainstemResource.status === 'success' && !!mainstemResource.data?.length && (
          <div className="panel-header-actions">
            {filter.toggleButton}
            {/* Exports what's listed, so an active filter narrows the CSV too. */}
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                downloadCsv(
                  featuresToCsv(filter.filtered),
                  `${slugify(selectedMainstem.name_at_outlet) || 'mainstem'}-associated-features.csv`,
                )
              }
              aria-label="Export listed features as CSV"
              title="Export listed features as CSV"
            >
              <DownloadIcon />
            </button>
          </div>
        )}
      </div>
      {mainstemResource.status === 'success' && filter.input}
      {mainstemResource.status === 'loading' && (
        <p className="panel-status panel-status-loading">
          <span className="spinner" aria-hidden="true" />
          Querying the graph…
        </p>
      )}
      {mainstemResource.status === 'error' && (
        <p className="panel-status panel-status-error">{mainstemResource.error}</p>
      )}
      {mainstemResource.status === 'success' && mainstemResource.data?.length === 0 && (
        <p className="panel-status">No features linked to this mainstem yet.</p>
      )}
      {mainstemResource.status === 'success' && filter.emptyMessage}
      {mainstemResource.status === 'success' && filter.filtered.length > 0 && (
        <ul className="feature-list">
          {filter.filtered.map((feature) => (
            <li key={feature.uri}>
              <button
                type="button"
                className={feature.uri === selectedNode ? 'active' : ''}
                onClick={() => {
                  selectNode(feature.uri)
                  flyTo(feature.lon, feature.lat)
                }}
              >
                <span
                  className="feature-list-dot"
                  style={{ backgroundColor: colorForSitemap(feature.sitemap, sitemapColorScale) }}
                />
                <span className="feature-list-text">
                  <span className="feature-list-name">{feature.name || feature.uri}</span>
                  {feature.description && (
                    <span className="feature-list-datasets">{feature.description}</span>
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
