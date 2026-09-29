import { useId, useRef, useState, type ReactNode } from 'react'
import {
  MAX_VIEW_TILES,
  MAX_ZOOM,
  MIN_ZOOM,
  PAD_TILES,
  STREAM_AREA_M2,
  computeFloodDepth,
  depthLegend,
  floodedArea,
} from '../analysis/floodDepth'
import { BUILDINGS_MINZOOM } from '../map/basemaps'
import { useExplorer } from '../state/ExplorerContext'
import { InfoIcon } from './InfoIcon'
import { PmtilesLayers } from './PmtilesLayers'

const MAX_LEVEL_M = 15
const TERRAIN_TILES_URL = 'https://registry.opendata.aws/terrain-tiles/'
// The building layer's documented fields (render_height and friends), and the
// TileJSON the map actually loads it from.
const BUILDINGS_SCHEMA_URL = 'https://openmaptiles.org/schema/#building'
const BUILDINGS_TILES_URL = 'https://tiles.openfreemap.org/planet'

/**
 * One map layer as a card: title and description, an info button that opens
 * how the layer is made, and the layer's own action button.
 */
function LayerCard({
  title,
  description,
  active,
  action,
  source,
  methodology,
  children,
}: {
  title: string
  description: string
  // Where the layer's data lives, linked under the description.
  source: { label: string; href: string }
  active: boolean
  action: ReactNode
  methodology: ReactNode
  children?: ReactNode
}) {
  const [showInfo, setShowInfo] = useState(false)
  const infoId = useId()
  return (
    <li className={active ? 'analysis-option active' : 'analysis-option'}>
      <div className="analysis-option-header">
        <span className="analysis-option-text">
          <span className="analysis-option-title">{title}</span>
          <span className="analysis-option-description">{description}</span>
          <a className="layer-source" href={source.href} target="_blank" rel="noreferrer">
            Data: {source.label} ↗
          </a>
        </span>
        <button
          type="button"
          className={showInfo ? 'layer-info-button open' : 'layer-info-button'}
          aria-expanded={showInfo}
          aria-controls={infoId}
          aria-label={`${showInfo ? 'Hide' : 'Show'} how the ${title.toLowerCase()} layer is made`}
          title="Methodology"
          onClick={() => setShowInfo((open) => !open)}
        >
          <InfoIcon />
        </button>
        {action}
      </div>
      {showInfo && (
        <div id={infoId} className="layer-methodology">
          {methodology}
        </div>
      )}
      {children}
    </li>
  )
}

function FloodDepthMethodology() {
  return (
    <>
      <p>
        <strong>Height Above Nearest Drainage (HAND)</strong> is the vertical distance from each
        spot on the ground down to the stream it drains to. Flooding everything whose HAND is below
        a water level is the terrain-only approximation behind NOAA's national flood inundation
        mapping.
      </p>
      <h4>Data</h4>
      <p>
        Elevation comes from the{' '}
        <a href={TERRAIN_TILES_URL} target="_blank" rel="noreferrer">
          Mapzen Terrain Tiles on AWS Open Data
        </a>{' '}
        (the same tiles as 3D terrain), which in the US are mostly derived from USGS 3DEP. The
        finest zoom level (up to {MAX_ZOOM}) that covers the view in {MAX_VIEW_TILES}×
        {MAX_VIEW_TILES} tiles is used, with {PAD_TILES} extra tile of context on every side so
        streams entering the view carry their upstream flow. Views needing coarser than zoom{' '}
        {MIN_ZOOM} are refused.
      </p>
      <h4>Steps</h4>
      <p>All run in your browser with WhiteboxTools:</p>
      <ol>
        <li>
          <strong>Condition the terrain.</strong> Depressions are breached by least-cost paths and
          any left are filled, with a 1 mm gradient across flats. Terrain tiles flatten rivers and
          lakes, and without this, flow pools on them instead of continuing downstream.
        </li>
        <li>
          <strong>Route flow.</strong> Each cell drains to its steepest neighbour (D8), and the
          number of cells draining through each cell is counted.
        </li>
        <li>
          <strong>Find streams.</strong> Any cell draining at least{' '}
          {(STREAM_AREA_M2 / 1e6).toLocaleString()} km² is a stream.
        </li>
        <li>
          <strong>Measure HAND.</strong> Each cell's flow path is followed down to the first stream
          cell, and HAND is the height difference between the two. Where a path leaves the area
          before reaching a stream, the nearest stream in a straight line stands in, and cells lower
          than it count as 0 m.
        </li>
        <li>
          <strong>Flood.</strong> A cell is under water when its HAND is below the water level, and
          the depth shown is the level minus its HAND. Only this step reruns as the slider moves.
        </li>
      </ol>
      <h4>Limits</h4>
      <ul>
        <li>
          Static, not hydraulic: it ignores levees, bridges, culverts, channel capacity and
          backwater, and says nothing about how likely a given level is.
        </li>
        <li>
          The same rise applies above every stream at once, so small creeks flood as much as the
          main river.
        </li>
        <li>
          Results are only as fine as the elevation cells, noted under the slider, and water
          surfaces in the tiles are flat, so rivers always show as the deepest class.
        </li>
      </ul>
    </>
  )
}

function BuildingsMethodology() {
  return (
    <>
      <p>
        Building footprints and heights come from <strong>OpenStreetMap</strong>, served as the{' '}
        <a href={BUILDINGS_SCHEMA_URL} target="_blank" rel="noreferrer">
          OpenMapTiles building layer
        </a>{' '}
        in{' '}
        <a href={BUILDINGS_TILES_URL} target="_blank" rel="noreferrer">
          OpenFreeMap's vector tiles
        </a>{' '}
        (the same tiles as the Light, Streets and Dark basemaps). Each footprint is extruded from
        its base height to its roof height.
      </p>
      <h4>Heights</h4>
      <p>
        Where a building is tagged with a height, that's used; otherwise it's estimated from its
        number of floors, and buildings with neither get a small default height. Coverage and
        tagging vary a lot from place to place, so outside big cities many buildings share that
        default.
      </p>
      <h4>Display</h4>
      <ul>
        <li>
          Buildings appear from zoom {BUILDINGS_MINZOOM} (street level); the tiles don't carry
          usable footprints below that.
        </li>
        <li>
          With 3D terrain on, buildings stand on the terrain surface, so they line up with a flood
          depth layer draped over it.
        </li>
        <li>
          On the Streets basemap, its own 3D buildings are hidden while this layer is on, so the two
          don't overlap.
        </li>
      </ul>
      <h4>With flood depth</h4>
      <p>
        Comparing footprints to the flooded area is a quick way to see which buildings sit low in
        the valley. Heights are roof heights, not first-floor elevations, so they can't say how deep
        water would be inside a building.
      </p>
    </>
  )
}

function FloodDepthLayer() {
  const {
    mapBounds,
    floodDepth,
    setFloodDepth,
    floodLevel,
    setFloodLevel,
    terrain3d,
    setTerrain3d,
  } = useExplorer()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  // A one-off computation for the view as it is now, not a live layer that
  // recomputes as the map moves: each run is several seconds of work.
  async function compute() {
    if (!mapBounds) return
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setRunning(true)
    setError(null)
    try {
      const result = await computeFloodDepth(mapBounds, current.signal)
      if (!current.signal.aborted) setFloodDepth(result)
    } catch (e) {
      if (current.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Flood depth failed')
    } finally {
      if (controller.current === current) setRunning(false)
    }
  }

  const area = floodDepth && floodedArea(floodDepth, floodLevel)
  const feet = Math.round(floodLevel * 3.281)

  return (
    <LayerCard
      title="Flood depth"
      description="Raise the water above every stream in this view, using height above nearest drainage (HAND) from the elevation tiles."
      active={!!floodDepth}
      source={{ label: 'Terrain Tiles, AWS Open Data', href: TERRAIN_TILES_URL }}
      methodology={<FloodDepthMethodology />}
      action={
        <button
          type="button"
          className={floodDepth ? 'active' : ''}
          aria-pressed={!!floodDepth}
          onClick={() => (floodDepth ? setFloodDepth(null) : compute())}
          disabled={running || (!floodDepth && !mapBounds)}
        >
          {running && <span className="spinner" aria-hidden="true" />}
          {running ? 'Computing' : floodDepth ? 'Hide' : 'Compute'}
        </button>
      }
    >
      {running && <p className="analysis-note">The first run loads the analysis engine (~5 MB).</p>}
      {error && <p className="panel-status panel-status-error">{error}</p>}

      {floodDepth && area && (
        <div className="analysis-result" aria-live="polite">
          <label className="flood-level">
            <span>Water level</span>
            <input
              type="range"
              min={0}
              max={MAX_LEVEL_M}
              step={0.5}
              value={floodLevel}
              onChange={(e) => setFloodLevel(Number(e.target.value))}
            />
            <output>
              {floodLevel} m ({feet} ft)
            </output>
          </label>
          <p>
            {area.km2.toLocaleString(undefined, { maximumFractionDigits: 1 })} km² (
            {Math.round(area.share * 100)}% of the area) under water, from{' '}
            {Math.round(floodDepth.cellSizeM)} m elevation cells.
          </p>
          <ul className="analysis-legend">
            {depthLegend.map((item) => (
              <li key={item.label}>
                <span className="analysis-swatch" style={{ backgroundColor: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
          <p className="analysis-note">
            A first look, not a forecast: HAND ignores levees, bridges and how much water the river
            can actually carry.
          </p>
          <div className="flood-actions">
            <button type="button" className="link-button" onClick={compute} disabled={running}>
              Recompute for the current view
            </button>
            {!terrain3d && (
              <button type="button" className="link-button" onClick={() => setTerrain3d(true)}>
                Show on 3D terrain
              </button>
            )}
          </div>
        </div>
      )}
    </LayerCard>
  )
}

function BuildingsLayer() {
  const { buildings3d, setBuildings3d } = useExplorer()
  return (
    <LayerCard
      title="3D buildings"
      description="Building heights from OpenStreetMap. Zoom in to street level to see them."
      active={buildings3d}
      source={{ label: 'OpenMapTiles building layer', href: BUILDINGS_SCHEMA_URL }}
      methodology={<BuildingsMethodology />}
      action={
        <button
          type="button"
          className={buildings3d ? 'active' : ''}
          aria-pressed={buildings3d}
          onClick={() => setBuildings3d(!buildings3d)}
        >
          {buildings3d ? 'Hide' : 'Show'}
        </button>
      }
    />
  )
}

// Each Geoconnex sitemap's PMTiles export is a map layer; the terrain-derived
// layers follow.
export function LayersTab() {
  return (
    <div className="layers-tab">
      <PmtilesLayers />

      <section className="layers-context" aria-labelledby="layers-context-heading">
        <h3 id="layers-context-heading">Flooding and buildings</h3>
        <ul className="analysis-options">
          <FloodDepthLayer />
          <BuildingsLayer />
        </ul>
      </section>
    </div>
  )
}
