import { useState } from 'react'
import { colorForSitemap, type SitemapColorScale } from '../lib/colors'
import { sitemapKey } from '../lib/features'
import type { GraphFeature } from '../lib/types'
import { FilterIcon } from './FilterIcon'

function matches(feature: GraphFeature, needle: string): boolean {
  return [feature.name, feature.description, feature.sitemap, feature.uri].some((field) =>
    field?.toLowerCase().includes(needle),
  )
}

/** Per-sitemap visibility toggles, owned by the caller so the map can honor them too. */
export interface SitemapToggles {
  hidden: ReadonlySet<string>
  onToggle: (sitemap: string) => void
  onShowAll: () => void
  colorScale: SitemapColorScale
}

/**
 * A collapsible text filter over an already-loaded feature list. `resetKey`
 * identifies the list (a mainstem IRI, a search's result array) — when it
 * changes the filter closes and clears, so a stale filter never silently hides
 * a new result set. With `sitemaps`, the open filter also lists a checkbox per
 * distinct sitemap in the list.
 */
export function useFeatureFilter(
  features: GraphFeature[],
  resetKey: unknown,
  sitemaps?: SitemapToggles,
) {
  const [state, setState] = useState({ key: resetKey, open: false, text: '' })
  if (!Object.is(state.key, resetKey)) {
    setState({ key: resetKey, open: false, text: '' })
  }

  const needle = state.text.trim().toLowerCase()
  const hidden = sitemaps?.hidden
  const filtered = features.filter(
    (feature) => !hidden?.has(sitemapKey(feature)) && (!needle || matches(feature, needle)),
  )

  const sitemapCounts = new Map<string, number>()
  if (sitemaps) {
    for (const feature of features) {
      const key = sitemapKey(feature)
      sitemapCounts.set(key, (sitemapCounts.get(key) ?? 0) + 1)
    }
  }
  const sitemapList = [...sitemapCounts].sort(([a], [b]) => a.localeCompare(b))
  const anyHidden = !!hidden?.size

  // Closing clears the text but leaves sitemap choices alone: those also drive
  // the map, and the button stays highlighted while any are hidden.
  const close = () => setState((prev) => ({ ...prev, open: false, text: '' }))
  const active = state.open || anyHidden

  const toggleButton = (
    <button
      type="button"
      className={active ? 'icon-button active' : 'icon-button'}
      onClick={() => (state.open ? close() : setState((prev) => ({ ...prev, open: true })))}
      aria-label={state.open ? 'Hide filter' : 'Filter features'}
      aria-pressed={state.open}
      title={state.open ? 'Hide filter' : 'Filter features'}
    >
      <FilterIcon />
    </button>
  )

  const input = state.open && (
    <div className="feature-filter-panel">
      <div className="feature-filter">
        <input
          type="search"
          autoFocus
          placeholder="Filter by name, description, source…"
          aria-label="Filter features"
          value={state.text}
          onChange={(e) => setState((prev) => ({ ...prev, text: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
          }}
        />
        {(needle || anyHidden) && (
          <span className="feature-filter-count">
            {filtered.length.toLocaleString()} of {features.length.toLocaleString()}
          </span>
        )}
      </div>
      {sitemaps && sitemapList.length > 1 && (
        <fieldset className="sitemap-toggles">
          <legend>
            Sources
            {anyHidden && (
              <button type="button" onClick={sitemaps.onShowAll}>
                Show all
              </button>
            )}
          </legend>
          {sitemapList.map(([sitemap, count]) => (
            <label key={sitemap} className="sitemap-toggle">
              <input
                type="checkbox"
                checked={!sitemaps.hidden.has(sitemap)}
                onChange={() => sitemaps.onToggle(sitemap)}
              />
              <span
                className="feature-list-dot"
                style={{ backgroundColor: colorForSitemap(sitemap, sitemaps.colorScale) }}
              />
              <span className="sitemap-toggle-name">{sitemap || 'Unknown source'}</span>
              <span className="sitemap-toggle-count">{count.toLocaleString()}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )

  const emptyMessage = features.length > 0 && filtered.length === 0 && (
    <p className="panel-status">
      {needle ? `No features match “${state.text.trim()}”.` : 'All sources are hidden.'}
    </p>
  )

  return { filtered, toggleButton, input, emptyMessage }
}
