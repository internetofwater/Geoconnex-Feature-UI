import { useState } from 'react'
import { useExplorer } from '../state/ExplorerContext'
import { SitemapsList } from './SitemapsList'

function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="5" cy="6" r="3" fill="#2a78d6" />
      <circle cx="11" cy="6" r="3" fill="#eb6834" />
      <circle cx="8" cy="11" r="3" fill="#1baf7a" />
    </svg>
  )
}

export function SitemapsWidget() {
  const { selectedNode } = useExplorer()
  const [expanded, setExpanded] = useState(false)

  // When the RDF property panel is open it has its own "Sitemaps" tab — showing
  // this floating widget too would just sit on top of it.
  if (selectedNode) return null

  if (!expanded) {
    return (
      <button
        type="button"
        className="legend-toggle"
        onClick={() => setExpanded(true)}
        aria-label="Show sitemap colors"
        title="Show sitemap colors"
      >
        <PaletteIcon />
      </button>
    )
  }

  return (
    <div className="legend-panel">
      <button
        type="button"
        className="side-panel-toggle legend-panel-close"
        onClick={() => setExpanded(false)}
        aria-label="Hide sitemap colors"
        title="Hide sitemap colors"
      >
        ✕
      </button>
      <h3>Sitemaps</h3>
      <SitemapsList />
    </div>
  )
}
