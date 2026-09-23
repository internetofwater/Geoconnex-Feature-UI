import { useState } from 'react'
import type { GraphFeature } from '../lib/types'
import { SearchIcon } from './SearchIcon'

function matches(feature: GraphFeature, needle: string): boolean {
  return [feature.name, feature.description, feature.sitemap, feature.uri].some((field) =>
    field?.toLowerCase().includes(needle),
  )
}

/**
 * A collapsible text filter over an already-loaded feature list. `resetKey`
 * identifies the list (a mainstem IRI, a search's result array) — when it
 * changes the filter closes and clears, so a stale filter never silently hides
 * a new result set.
 */
export function useFeatureFilter(features: GraphFeature[], resetKey: unknown) {
  const [state, setState] = useState({ key: resetKey, open: false, text: '' })
  if (!Object.is(state.key, resetKey)) {
    setState({ key: resetKey, open: false, text: '' })
  }

  const needle = state.text.trim().toLowerCase()
  const filtered = needle ? features.filter((feature) => matches(feature, needle)) : features

  const close = () => setState((prev) => ({ ...prev, open: false, text: '' }))

  const toggleButton = (
    <button
      type="button"
      className={state.open ? 'icon-button active' : 'icon-button'}
      onClick={() => (state.open ? close() : setState((prev) => ({ ...prev, open: true })))}
      aria-label={state.open ? 'Hide filter' : 'Filter features'}
      aria-pressed={state.open}
      title={state.open ? 'Hide filter' : 'Filter features'}
    >
      <SearchIcon />
    </button>
  )

  const input = state.open && (
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
      {needle && (
        <span className="feature-filter-count">
          {filtered.length.toLocaleString()} of {features.length.toLocaleString()}
        </span>
      )}
    </div>
  )

  const emptyMessage = needle && filtered.length === 0 && (
    <p className="panel-status">No features match “{state.text.trim()}”.</p>
  )

  return { filtered, toggleButton, input, emptyMessage }
}
