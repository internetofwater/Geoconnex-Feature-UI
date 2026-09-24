import type { GeoJSONSource, Map as MaplibreMap, MapLibreEvent } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import {
  bearingDeg,
  fetchRunnerLeg,
  legLength,
  smoothedPointAlong,
  trimToJoin,
  type RunnerLeg,
} from '../lib/riverRunner'
import { prefetchMainstemFeatures } from '../lib/features'
import { DropletIcon } from '../panel/DropletIcon'
import { useExplorer } from '../state/ExplorerContext'
import { TERRAIN_PITCH, type BasemapId } from './basemaps'
import { RIVER_RUNNER_LAYER_ID, RIVER_RUNNER_SOURCE_ID, riverRunnerLayer } from './layers'
import { whenStyleReady } from './styleReady'

// Imagery shows the actual channel, banks and floodplain along the way.
const RUNNER_BASEMAP: BasemapId = 'satellite'
const BASE_SPEED_KM_PER_S = 0.4
const SPEEDS = [1, 2, 5, 10, 25]
// Camera framing, scaled with speed (km/s) so fast runs look further ahead,
// smooth over a longer stretch of river and fly higher — which is what keeps
// them from swinging at every sharp vertex in the flowline.
const SMOOTH_RADIUS = { minKm: 0.3, seconds: 0.8 }
const CENTER_LEAD = { minKm: 0.6, seconds: 1 }
const AIM_AHEAD = { minKm: 1.5, seconds: 4 }
const CAMERA_ZOOM = 13.5
const MIN_CAMERA_ZOOM = 10.5
// MapLibre's queryRenderedFeatures (hover, click) stops returning features
// reliably above ~70° of pitch, so the camera stays right at that limit.
const CAMERA_PITCH = 70
const RUNNER_MAX_PITCH = 85
const DEFAULT_MAX_PITCH = 60
// How quickly the heading eases toward the river's direction (per second), and
// a hard cap on how fast it may turn.
const TURN_RATE = 0.9
const MAX_TURN_DEG_PER_S = 30
// How quickly altitude follows a speed change (per second).
const ZOOM_RATE = 1.5
// The next river's flowline is requested halfway along the current one, or
// earlier if the current one would otherwise run out within this many seconds
// at the current speed — short creeks at high speed would otherwise stall.
const NEXT_LEG_LEAD_S = 30
// Scrolling while running zooms relative to the speed-based altitude, within
// this many zoom levels either way, easing in at ZOOM_OFFSET_RATE per second.
const MAX_ZOOM_OFFSET = 4
const ZOOM_OFFSET_RATE = 8
// Zoom levels per pixel of wheel delta.
const WHEEL_ZOOM_PER_PX = 1 / 450

function clampOffset(offset: number): number {
  return Math.max(-MAX_ZOOM_OFFSET, Math.min(MAX_ZOOM_OFFSET, offset))
}

function scaled(setting: { minKm: number; seconds: number }, kmPerS: number): number {
  return Math.max(setting.minKm, setting.seconds * kmPerS)
}

// Rises about 0.8 zoom levels per doubling of speed above 1×.
function zoomForSpeed(kmPerS: number): number {
  const factor = Math.max(1, kmPerS / BASE_SPEED_KM_PER_S)
  return Math.max(MIN_CAMERA_ZOOM, CAMERA_ZOOM - 0.8 * Math.log2(factor))
}

type Status = 'loading' | 'restarting' | 'running' | 'waiting' | 'finished' | 'error'

interface RunState {
  legs: RunnerLeg[]
  index: number
  // km along the current leg
  distance: number
  // km covered by the legs already finished
  completed: number
  speed: number
  paused: boolean
  nextRequested: boolean
  bearing: number | null
  zoom: number
  zoomOffset: number
  zoomOffsetTarget: number
  status: Status
}

interface Hud {
  status: Status
  riverName: string
  nextName: string | null
  previousName: string | null
  traveledKm: number
  paused: boolean
  speed: number
  error: string | null
}

function RestartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.2 6.2A5.2 5.2 0 1 1 3 9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M2.6 2.8v3.6h3.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RiverRunner({
  map,
  start,
}: {
  map: MaplibreMap
  start: { uri: string; name: string }
}) {
  const { terrain3d, setTerrain3d, basemap, setBasemap, selectMainstem, stopRiverRunner } =
    useExplorer()
  // Captured once, so exiting restores the terrain and basemap the user had.
  const terrainBefore = useRef(terrain3d)
  const basemapBefore = useRef(basemap)
  const run = useRef<RunState>({
    legs: [],
    index: 0,
    distance: 0,
    completed: 0,
    speed: 2,
    paused: false,
    nextRequested: false,
    bearing: null,
    zoom: CAMERA_ZOOM,
    zoomOffset: 0,
    zoomOffsetTarget: 0,
    status: 'loading',
  })
  // Set by the effect below, which owns everything a restart has to reset.
  const restart = useRef<(() => void) | null>(null)
  const [hud, setHud] = useState<Hud>({
    status: 'loading',
    riverName: start.name,
    nextName: null,
    previousName: null,
    traveledKm: 0,
    paused: false,
    speed: 2,
    error: null,
  })

  useEffect(() => {
    const r = run.current
    const terrainWasOn = terrainBefore.current
    const previousBasemap = basemapBefore.current
    const controller = new AbortController()
    let frame = 0
    let lastFrame = performance.now()
    let lastHud = 0
    let cancelStyleWait = () => {}

    const syncHud = (extra: Partial<Hud> = {}) => {
      const leg = r.legs[r.index]
      setHud((prev) => ({
        ...prev,
        status: r.status,
        riverName: leg?.name ?? prev.riverName,
        nextName: r.legs[r.index + 1]?.name ?? null,
        previousName: r.legs[r.index - 1]?.name ?? null,
        traveledKm: r.completed + r.distance,
        paused: r.paused,
        speed: r.speed,
        ...extra,
      }))
    }

    const fail = (error: unknown) => {
      if (controller.signal.aborted) return
      r.status = 'error'
      syncHud({ error: error instanceof Error ? error.message : String(error) })
    }

    const drawRoute = () => {
      const source = map.getSource(RIVER_RUNNER_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiLineString', coordinates: r.legs.map((leg) => leg.coords) },
      })
    }

    const ensureRouteLayer = () => {
      if (!map.getSource(RIVER_RUNNER_SOURCE_ID)) {
        map.addSource(RIVER_RUNNER_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
      }
      if (!map.getLayer(RIVER_RUNNER_LAYER_ID)) map.addLayer(riverRunnerLayer)
    }

    // Lazy loading: the next river downstream is only fetched once the runner is
    // halfway along the current one.
    // A river's features are fetched as soon as the river upstream of it is
    // loaded — a full river ahead — since that query is the slow one and must
    // be ready to swap in when the runner arrives.
    const prefetchDownstreamFeatures = (leg: RunnerLeg) => {
      if (leg.downstream) prefetchMainstemFeatures(leg.downstream)
    }

    const requestNext = (leg: RunnerLeg) => {
      if (!leg.downstream) return
      r.nextRequested = true
      fetchRunnerLeg(leg.downstream, controller.signal)
        .then((next) => {
          prefetchDownstreamFeatures(next)
          r.legs.push(trimToJoin(next, leg.coords[leg.coords.length - 1]))
          drawRoute()
          syncHud()
        })
        .catch(fail)
    }

    const moveCamera = (leg: RunnerLeg, dt: number) => {
      const kmPerS = BASE_SPEED_KM_PER_S * r.speed
      const radius = scaled(SMOOTH_RADIUS, kmPerS)
      const here = smoothedPointAlong(leg, r.distance, radius)
      const ahead = smoothedPointAlong(leg, r.distance + scaled(AIM_AHEAD, kmPerS), radius)
      if (here[0] !== ahead[0] || here[1] !== ahead[1]) {
        const target = bearingDeg(here, ahead)
        if (r.bearing === null) r.bearing = target
        else {
          const delta = ((target - r.bearing + 540) % 360) - 180
          const maxStep = MAX_TURN_DEG_PER_S * dt
          const step = delta * Math.min(1, dt * TURN_RATE)
          r.bearing += Math.max(-maxStep, Math.min(maxStep, step))
        }
      }
      r.zoom += (zoomForSpeed(kmPerS) - r.zoom) * Math.min(1, dt * ZOOM_RATE)
      r.zoomOffset += (r.zoomOffsetTarget - r.zoomOffset) * Math.min(1, dt * ZOOM_OFFSET_RATE)
      map.jumpTo({
        center: smoothedPointAlong(leg, r.distance + scaled(CENTER_LEAD, kmPerS), radius),
        bearing: r.bearing ?? map.getBearing(),
        pitch: CAMERA_PITCH,
        zoom: r.zoom + r.zoomOffset,
      })
    }

    const tick = (now: number) => {
      const dt = Math.min((now - lastFrame) / 1000, 0.1)
      lastFrame = now
      const leg = r.legs[r.index]
      const moving = !r.paused && (r.status === 'running' || r.status === 'waiting')
      // While moving, the wheel is handled by onWheel below; MapLibre's own
      // scroll zoom would fight the camera being set every frame.
      if (moving === map.scrollZoom.isEnabled()) {
        if (moving) map.scrollZoom.disable()
        else map.scrollZoom.enable()
      }
      if (leg && moving) {
        r.distance += BASE_SPEED_KM_PER_S * r.speed * dt
        const length = legLength(leg)
        const secondsLeft = (length - r.distance) / (BASE_SPEED_KM_PER_S * r.speed)
        const nextLoaded = r.index + 1 < r.legs.length
        if (
          !r.nextRequested &&
          !nextLoaded &&
          (r.distance >= length / 2 || secondsLeft < NEXT_LEG_LEAD_S)
        ) {
          requestNext(leg)
        }
        if (r.distance >= length) {
          const next = r.legs[r.index + 1]
          if (next) {
            r.completed += length
            r.distance -= length
            r.index += 1
            r.nextRequested = false
            r.status = 'running'
            // Make the new river the selected mainstem, like clicking it would:
            // its features replace the last river's on the map and in the panel.
            selectMainstem(next.mainstem)
            syncHud()
          } else {
            r.distance = length
            const status: Status = leg.downstream ? 'waiting' : 'finished'
            if (r.status !== status) {
              r.status = status
              syncHud()
            }
          }
        }
        moveCamera(r.legs[r.index], dt)
        if (now - lastHud > 250) {
          lastHud = now
          syncHud()
        }
      }
      frame = requestAnimationFrame(tick)
    }

    // Dragging or rotating pauses the run so the user can look around;
    // programmatic moves have no originalEvent. Scroll-zooming doesn't pause.
    const pauseOnInteraction = (e: MapLibreEvent<unknown>) => {
      if (!(e as { originalEvent?: Event }).originalEvent || r.paused) return
      r.paused = true
      syncHud()
    }
    map.on('movestart', pauseOnInteraction)

    const onWheel = (e: WheelEvent) => {
      if (map.scrollZoom.isEnabled()) return
      const pixels = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 40 : e.deltaY
      r.zoomOffsetTarget = clampOffset(r.zoomOffsetTarget - pixels * WHEEL_ZOOM_PER_PX)
    }
    const canvasContainer = map.getCanvasContainer()
    canvasContainer.addEventListener('wheel', onWheel, { passive: true })

    setTerrain3d(true)
    setBasemap(RUNNER_BASEMAP)
    map.setMaxPitch(RUNNER_MAX_PITCH)

    // Frames the head of the first river, then hands over to the frame loop.
    const flyToStart = (onArrive: () => void) => {
      const leg = r.legs[0]
      const kmPerS = BASE_SPEED_KM_PER_S * r.speed
      const radius = scaled(SMOOTH_RADIUS, kmPerS)
      r.zoom = zoomForSpeed(kmPerS)
      r.bearing = bearingDeg(
        smoothedPointAlong(leg, 0, radius),
        smoothedPointAlong(leg, scaled(AIM_AHEAD, kmPerS), radius),
      )
      map.flyTo({
        center: smoothedPointAlong(leg, scaled(CENTER_LEAD, kmPerS), radius),
        bearing: r.bearing,
        pitch: CAMERA_PITCH,
        zoom: r.zoom + r.zoomOffset,
        duration: 2500,
        essential: true,
      })
      map.once('moveend', () => {
        if (controller.signal.aborted) return
        r.status = 'running'
        lastFrame = performance.now()
        syncHud()
        onArrive()
      })
    }

    // Back to the head of the first river. Legs already loaded are kept, so the
    // replay doesn't refetch anything it has already seen.
    restart.current = () => {
      if (!r.legs.length || r.status === 'loading' || r.status === 'restarting') return
      r.index = 0
      r.distance = 0
      r.completed = 0
      r.paused = false
      r.nextRequested = false
      r.status = 'restarting'
      syncHud()
      drawRoute()
      selectMainstem(r.legs[0].mainstem)
      flyToStart(() => {})
    }

    fetchRunnerLeg(start.uri, controller.signal)
      .then((leg) => {
        r.legs = [leg]
        prefetchDownstreamFeatures(leg)
        const addRoute = () => {
          ensureRouteLayer()
          drawRoute()
        }
        cancelStyleWait = whenStyleReady(map, addRoute)

        flyToStart(() => {
          frame = requestAnimationFrame(tick)
        })
      })
      .catch(fail)

    return () => {
      controller.abort()
      cancelAnimationFrame(frame)
      cancelStyleWait()
      map.off('movestart', pauseOnInteraction)
      canvasContainer.removeEventListener('wheel', onWheel)
      map.scrollZoom.enable()
      if (map.getLayer(RIVER_RUNNER_LAYER_ID)) map.removeLayer(RIVER_RUNNER_LAYER_ID)
      if (map.getSource(RIVER_RUNNER_SOURCE_ID)) map.removeSource(RIVER_RUNNER_SOURCE_ID)
      map.setMaxPitch(DEFAULT_MAX_PITCH)
      map.easeTo({
        pitch: terrainWasOn ? TERRAIN_PITCH : 0,
        bearing: 0,
        zoom: Math.min(map.getZoom(), 11),
        duration: 1000,
      })
      setTerrain3d(terrainWasOn)
      setBasemap(previousBasemap)
    }
    // Runs once per river runner session (the parent keys this component by the
    // starting mainstem); terrain and exit handlers are read at start/exit only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, start.uri])

  const handleRestart = () => restart.current?.()

  const togglePause = () => {
    const r = run.current
    // Keep any zooming done while paused instead of snapping back on resume.
    if (r.paused) r.zoomOffset = r.zoomOffsetTarget = clampOffset(map.getZoom() - r.zoom)
    run.current.paused = !run.current.paused
    setHud((prev) => ({ ...prev, paused: run.current.paused }))
  }
  const setSpeed = (speed: number) => {
    run.current.speed = speed
    setHud((prev) => ({ ...prev, speed }))
  }

  // Only for states worth calling out; running and paused speak for themselves.
  const statusText =
    hud.status === 'loading'
      ? 'Loading the river…'
      : hud.status === 'restarting'
        ? 'Heading back to the first river…'
        : hud.status === 'error'
          ? `Couldn't continue: ${hud.error}`
          : hud.status === 'finished'
            ? `Reached the terminus of the ${hud.riverName}.`
            : hud.status === 'waiting'
              ? 'Loading the next river downstream…'
              : null

  const busy = hud.status === 'loading' || hud.status === 'restarting'

  return (
    <div className="river-runner-hud" role="region" aria-label="River runner">
      <div className="river-runner-title">
        <span className="river-runner-icon">
          <DropletIcon />
        </span>
        <span className="river-runner-river">{hud.riverName}</span>
        <span className="river-runner-distance">{hud.traveledKm.toFixed(1)} km</span>
      </div>
      {(hud.previousName || hud.nextName) && (
        <p className="river-runner-route">
          {hud.previousName && (
            <span>
              Previous: <strong>{hud.previousName}</strong>
            </span>
          )}
          {hud.previousName && hud.nextName && (
            <span className="river-runner-route-arrow" aria-hidden="true">
              |
            </span>
          )}
          {hud.nextName && (
            <span>
              Next: <strong>{hud.nextName}</strong>
            </span>
          )}
        </p>
      )}
      {statusText && (
        <p className="river-runner-status" aria-live="polite">
          {statusText}
        </p>
      )}
      <div className="river-runner-controls">
        <button
          type="button"
          onClick={togglePause}
          disabled={busy || hud.status === 'finished' || hud.status === 'error'}
        >
          {hud.paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          className="river-runner-restart"
          onClick={handleRestart}
          disabled={busy}
          aria-label="Restart from the first river"
          title="Restart from the first river"
        >
          <RestartIcon />
        </button>
        <div className="river-runner-speeds" role="group" aria-label="Speed">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={speed === hud.speed ? 'active' : ''}
              aria-pressed={speed === hud.speed}
              onClick={() => setSpeed(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
        <button type="button" className="river-runner-exit" onClick={stopRiverRunner}>
          Exit
        </button>
      </div>
    </div>
  )
}
