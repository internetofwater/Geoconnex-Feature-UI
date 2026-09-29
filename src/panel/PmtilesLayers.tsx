import { useState, type ReactNode } from 'react'
import { OTHER_SITEMAP_COLOR } from '../lib/colors'
import { DEFAULT_LAYER_STYLE, type LayerStyle } from '../lib/pmtiles'
import { MAINSTEM_LARGE_COLOR } from '../map/layers'
import { useExplorer } from '../state/ExplorerContext'
import { SettingsIcon } from './SettingsIcon'

// A color input only takes #rrggbb; let the browser convert the sitemap
// colors' hsl() for it.
let colorContext: CanvasRenderingContext2D | null = null
function toHex(color: string): string {
  colorContext ??= document.createElement('canvas').getContext('2d')
  if (!colorContext) return '#000000'
  colorContext.fillStyle = '#000000'
  colorContext.fillStyle = color
  return colorContext.fillStyle
}

/**
 * The Geoconnex PMTiles exports as map layers: the draw order of the
 * switched-on ones and the mainstem network, reordered by dragging or with the
 * arrow buttons (the top draws on top), then a checklist of every export.
 */
export function PmtilesLayers() {
  const {
    pmtilesExportsResource,
    layerStack,
    pmtilesInspect,
    showMainstems,
    sitemapEntriesResource,
    sitemapColorScale,
    togglePmtilesLayer,
    moveStackLayer,
    setPmtilesInspect,
    setShowMainstems,
    layerStyles,
    setLayerStyle,
  } = useExplorer()
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  // The stack layer whose settings are open; one at a time.
  const [settingsFor, setSettingsFor] = useState<string | null>(null)

  const descriptions = new Map(
    (sitemapEntriesResource.data ?? []).map((entry) => [entry.id, entry.description]),
  )
  const titleFor = (id: string) => descriptions.get(id) || id
  const styleFor = (id: string) => layerStyles.get(id) ?? DEFAULT_LAYER_STYLE
  const defaultColorFor = (id: string) => sitemapColorScale.get(id) ?? OTHER_SITEMAP_COLOR
  const colorFor = (id: string) => styleFor(id).color ?? defaultColorFor(id)
  const exports = pmtilesExportsResource.data ?? []
  const on = new Set(layerStack.map((layer) => layer.id))
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? exports.filter((e) => `${e.id} ${titleFor(e.id)}`.toLowerCase().includes(needle))
    : exports

  function drop(index: number) {
    if (dragging) moveStackLayer(dragging, index)
    setDragging(null)
    setDropIndex(null)
  }

  return (
    <section className="pmtiles-layers" aria-labelledby="pmtiles-layers-heading">
      <div className="pmtiles-layers-header">
        <h3 id="pmtiles-layers-heading">Geoconnex layers</h3>
        <label className="pmtiles-inspect-toggle">
          <input
            type="checkbox"
            checked={pmtilesInspect}
            onChange={(e) => setPmtilesInspect(e.target.checked)}
          />
          Hover Features for Info
        </label>
      </div>

      <div className="pmtiles-stack">
        <h4>Draw order</h4>
        <ol onDragLeave={(e) => e.currentTarget === e.target && setDropIndex(null)}>
          {layerStack.map((layer, index) => {
            const mainstems = layer.kind === 'mainstems'
            const title = mainstems ? 'Mainstem rivers' : titleFor(layer.id)
            const style = styleFor(layer.id)
            return (
              <StackRow
                key={layer.id}
                id={layer.id}
                title={title}
                swatch={
                  mainstems && !style.color ? (
                    <span className="legend-swatch mainstems-swatch" />
                  ) : (
                    <span
                      className="legend-swatch"
                      style={{ backgroundColor: colorFor(layer.id) }}
                    />
                  )
                }
                note={
                  mainstems ? (
                    <span className="pmtiles-stack-description">
                      A simplified view of mainstem rivers used for finding associated monitoring
                      locations
                    </span>
                  ) : layer.status === 'loading' ? (
                    'Loading…'
                  ) : layer.status === 'error' ? (
                    <span className="panel-status-error">{layer.error}</span>
                  ) : (
                    layer.id
                  )
                }
                visible={mainstems ? showMainstems : true}
                onToggle={() =>
                  mainstems ? setShowMainstems(!showMainstems) : togglePmtilesLayer(layer)
                }
                first={index === 0}
                last={index === layerStack.length - 1}
                dragging={dragging === layer.id}
                dropTarget={dragging !== null && dropIndex === index && dragging !== layer.id}
                onDragStart={() => setDragging(layer.id)}
                onDragEnd={() => {
                  setDragging(null)
                  setDropIndex(null)
                }}
                onDragOver={() => setDropIndex(index)}
                onDrop={() => drop(index)}
                onMove={(delta) => moveStackLayer(layer.id, index + delta)}
                settingsOpen={settingsFor === layer.id}
                onToggleSettings={() =>
                  setSettingsFor((open) => (open === layer.id ? null : layer.id))
                }
                settings={
                  <LayerSettings
                    title={title}
                    style={style}
                    defaultColor={mainstems ? MAINSTEM_LARGE_COLOR : defaultColorFor(layer.id)}
                    onChange={(next) => setLayerStyle(layer.id, next)}
                    onReset={() => setLayerStyle(layer.id, null)}
                  />
                }
              />
            )
          })}
        </ol>
      </div>

      <h4 className="pmtiles-all-heading">All layers</h4>
      {pmtilesExportsResource.status === 'loading' && (
        <p className="panel-status">Loading layers…</p>
      )}
      {pmtilesExportsResource.status === 'error' && (
        <p className="panel-status panel-status-error">{pmtilesExportsResource.error}</p>
      )}
      {exports.length > 0 && (
        <>
          <input
            type="search"
            className="pmtiles-filter"
            placeholder={`Filter ${exports.length} layers`}
            aria-label="Filter layers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="legend pmtiles-list">
            {shown.map((layer) => (
              <li key={layer.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={on.has(layer.id)}
                    onChange={() => togglePmtilesLayer(layer)}
                  />
                  <span className="legend-swatch" style={{ backgroundColor: colorFor(layer.id) }} />
                  <span className="legend-text">
                    <span className="legend-label">{titleFor(layer.id)}</span>
                    <span className="legend-id">{layer.id}</span>
                  </span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="panel-status">No layers match “{query}”.</li>}
          </ul>
        </>
      )}
    </section>
  )
}

// One layer in the draw order. Its checkbox shows or hides it: a PMTiles layer
// leaves the stack when hidden, the mainstems stay in place, dimmed.
function StackRow({
  id,
  title,
  swatch,
  note,
  visible,
  onToggle,
  first,
  last,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
  settingsOpen,
  onToggleSettings,
  settings,
}: {
  id: string
  title: string
  swatch: ReactNode
  note: ReactNode
  visible: boolean
  onToggle: () => void
  first: boolean
  last: boolean
  dragging: boolean
  dropTarget: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onDrop: () => void
  onMove: (delta: -1 | 1) => void
  settingsOpen: boolean
  onToggleSettings: () => void
  settings: ReactNode
}) {
  const className = [
    'pmtiles-stack-row',
    !visible && 'off',
    dragging && 'dragging',
    dropTarget && 'drop-target',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <li
      className={className}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      {/* Only this part drags, so the settings' slider can still be slid. */}
      <div
        className="pmtiles-stack-row-main"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          // Firefox won't start a drag without some data set.
          e.dataTransfer.setData('text/plain', id)
          onDragStart()
        }}
        onDragEnd={onDragEnd}
      >
        <span className="pmtiles-grip" aria-hidden="true">
          ⋮⋮
        </span>
        <input
          type="checkbox"
          checked={visible}
          onChange={onToggle}
          aria-label={`${visible ? 'Hide' : 'Show'} ${title}`}
        />
        {swatch}
        <span className="pmtiles-stack-text">
          <span className="legend-label">{title}</span>
          <span className="legend-id">{note}</span>
        </span>
        <span className="pmtiles-stack-actions">
          <button
            type="button"
            className={settingsOpen ? 'open' : ''}
            onClick={onToggleSettings}
            aria-expanded={settingsOpen}
            aria-label={`${title} settings`}
            title="Color and opacity"
          >
            <SettingsIcon />
          </button>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label={`Move ${title} up`}
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label={`Move ${title} down`}
            title="Move down"
          >
            ↓
          </button>
        </span>
      </div>
      {settingsOpen && settings}
    </li>
  )
}

function LayerSettings({
  title,
  style,
  defaultColor,
  onChange,
  onReset,
}: {
  title: string
  style: LayerStyle
  defaultColor: string
  onChange: (style: LayerStyle) => void
  onReset: () => void
}) {
  const percent = Math.round(style.opacity * 100)
  const isDefault = style.color === null && style.opacity === 1
  return (
    <div className="pmtiles-layer-settings">
      <label>
        <span>Color</span>
        <input
          type="color"
          value={toHex(style.color ?? defaultColor)}
          onChange={(e) => onChange({ ...style, color: e.target.value })}
          aria-label={`${title} color`}
        />
      </label>
      <label>
        <span>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          onChange={(e) => onChange({ ...style, opacity: Number(e.target.value) / 100 })}
          aria-label={`${title} opacity`}
        />
        <output>{percent}%</output>
      </label>
      <button type="button" className="link-button" onClick={onReset} disabled={isDefault}>
        Reset
      </button>
    </div>
  )
}
