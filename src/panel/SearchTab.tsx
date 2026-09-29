import { useState, type FormEvent, type ReactNode } from 'react'
import { colorForSitemap } from '../lib/colors'
import { normalizeSitemapId } from '../lib/sitemaps'
import { useExplorer, type SearchArea } from '../state/ExplorerContext'
import { useFeatureFilter } from './FeatureFilter'
import { PlaceSearch } from './PlaceSearch'
import { SourcePicker } from './SourcePicker'

export function SearchTab() {
  const {
    selectedNode,
    selectNode,
    flyTo,
    searchResource,
    sitemapColorScale,
    mapBounds,
    runSearch,
    searchArea,
    areaPicking,
    setSearchArea,
    setAreaPicking,
  } = useExplorer()
  const [term, setTerm] = useState('')
  const [sitemapId, setSitemapId] = useState('')

  const areaBbox =
    searchArea.kind === 'view' ? mapBounds : searchArea.kind === 'anywhere' ? null : searchArea.bbox
  // A box or feature area that hasn't been drawn or picked yet.
  const areaMissing = searchArea.kind !== 'view' && searchArea.kind !== 'anywhere' && !areaBbox

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    runSearch({
      term,
      sitemapId: sitemapId || undefined,
      bbox: areaBbox ?? undefined,
    })
  }

  function openFeature(feature: { uri: string; lon: number; lat: number }) {
    selectNode(feature.uri)
    flyTo(feature.lon, feature.lat)
  }

  const isSearching = searchResource.status === 'loading'
  // A name, an area, or both.
  const canSearch = (!!term.trim() || !!areaBbox) && !areaMissing && !isSearching
  const filter = useFeatureFilter(searchResource.data ?? [], searchResource.data)

  return (
    <div className="search-tab">
      <PlaceSearch />
      <form className="search-controls" onSubmit={handleSubmit}>
        <input
          type="search"
          placeholder="Search features by name…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="search-row">
          <SourcePicker value={sitemapId} onChange={setSitemapId} />
          <button type="submit" disabled={!canSearch}>
            {isSearching && <span className="spinner" aria-hidden="true" />}
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </div>
        <SearchAreaPicker
          area={searchArea}
          picking={areaPicking}
          onChange={setSearchArea}
          onPick={setAreaPicking}
        />
      </form>

      {searchResource.status === 'loading' && (
        <p className="panel-status">Searching — this can take up to a minute…</p>
      )}
      {searchResource.status === 'error' && (
        <p className="panel-status panel-status-error">{searchResource.error}</p>
      )}
      {searchResource.status === 'success' && searchResource.data?.length === 0 && (
        <p className="panel-status">No features matched.</p>
      )}
      {searchResource.status === 'success' && !!searchResource.data?.length && (
        <>
          <div className="panel-header-row">
            <p className="panel-status">
              {searchResource.data.length.toLocaleString()}{' '}
              {searchResource.data.length === 1 ? 'result' : 'results'}
            </p>
            {filter.toggleButton}
          </div>
          {filter.input}
          {filter.emptyMessage}
        </>
      )}
      {searchResource.status === 'success' && filter.filtered.length > 0 && (
        <ul className="feature-list">
          {filter.filtered.map((feature) => (
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

const AREA_OPTIONS: { kind: SearchArea['kind']; label: string }[] = [
  { kind: 'view', label: 'Map view' },
  { kind: 'box', label: 'Draw box' },
  { kind: 'feature', label: 'Feature' },
  { kind: 'anywhere', label: 'Anywhere' },
]

// Where the search looks, and for a box or feature area, drawing or picking it.
function SearchAreaPicker({
  area,
  picking,
  onChange,
  onPick,
}: {
  area: SearchArea
  picking: 'box' | 'feature' | null
  onChange: (area: SearchArea) => void
  onPick: (picking: 'box' | 'feature' | null) => void
}) {
  function choose(kind: SearchArea['kind']) {
    if (kind === area.kind) return
    if (kind === 'box') onChange({ kind, bbox: null })
    else if (kind === 'feature') onChange({ kind, bbox: null, name: null, uri: null })
    else onChange({ kind })
  }

  let note: ReactNode
  if (area.kind === 'view') {
    note = 'Features entirely inside the current map view.'
  } else if (area.kind === 'anywhere') {
    note = 'Everywhere, so a name is needed.'
  } else if (picking) {
    note = (
      <>
        {picking === 'box'
          ? 'Drag on the map to draw a box.'
          : 'Click a feature on the map: a layer feature, a river or a result.'}{' '}
        <button type="button" className="link-button" onClick={() => onPick(null)}>
          Cancel
        </button>
      </>
    )
  } else {
    const kind = area.kind
    note = (
      <>
        {!area.bbox
          ? kind === 'box'
            ? 'No box drawn yet.'
            : 'No feature picked yet.'
          : kind === 'box'
            ? 'Features entirely inside the box you drew.'
            : `Features entirely inside the extent of ${area.name ?? 'the feature you picked'}.`}{' '}
        <button type="button" className="link-button" onClick={() => onPick(kind)}>
          {area.bbox
            ? kind === 'box'
              ? 'Redraw'
              : 'Pick another'
            : kind === 'box'
              ? 'Draw'
              : 'Pick'}
        </button>
      </>
    )
  }

  return (
    <div className="search-area">
      <div className="search-area-options" role="radiogroup" aria-label="Search area">
        {AREA_OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            role="radio"
            aria-checked={area.kind === option.kind}
            className={area.kind === option.kind ? 'active' : ''}
            onClick={() => choose(option.kind)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="search-area-note">{note}</p>
    </div>
  )
}
