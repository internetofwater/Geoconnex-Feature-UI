import { createContext, useContext, useMemo, useReducer, useState, type ReactNode } from 'react'
import { buildSitemapColorScale, type SitemapColorScale } from '../lib/colors'
import { fetchDatasetSummaries, type DatasetSummary } from '../lib/datasets'
import {
  loadMainstemFeatures,
  searchFeatures,
  searchResourceKey,
  type Bbox,
  type FeatureSearchParams,
} from '../lib/features'
import { buildOneHopQuery } from '../lib/queries'
import { toTripleRows } from '../lib/rdf'
import { runSparqlQuery } from '../lib/sparql'
import { fetchSitemapEntries, type SitemapEntry } from '../lib/sitemaps'
import type { GraphFeature, MainstemFeatureProps, ResourceState, TripleRow } from '../lib/types'
import { DEFAULT_BASEMAP, type BasemapId } from '../map/basemaps'
import type { AnalysisResult } from '../analysis/analyses'
import { fetchDownstreamPath } from '../analysis/downstream'
import type { RunnerLeg } from '../lib/riverRunner'
import { useAsyncResource } from './useAsyncResource'

interface ExplorerState {
  selectedMainstem: MainstemFeatureProps | null
  selectedNode: string | null
}

type Action =
  | { type: 'SELECT_MAINSTEM'; feature: MainstemFeatureProps }
  | { type: 'SELECT_NODE'; uri: string }
  | { type: 'CLEAR_NODE' }
  | { type: 'CLEAR_SELECTION' }

const initialState: ExplorerState = {
  selectedMainstem: null,
  selectedNode: null,
}

function reducer(state: ExplorerState, action: Action): ExplorerState {
  switch (action.type) {
    case 'SELECT_MAINSTEM':
      return { selectedMainstem: action.feature, selectedNode: null }
    case 'SELECT_NODE':
      return { ...state, selectedNode: action.uri }
    case 'CLEAR_NODE':
      return { ...state, selectedNode: null }
    case 'CLEAR_SELECTION':
      return { selectedMainstem: null, selectedNode: null }
    default:
      return state
  }
}

async function fetchOneHop(uri: string, signal: AbortSignal): Promise<TripleRow[]> {
  const results = await runSparqlQuery(buildOneHopQuery(uri), signal)
  return toTripleRows(results.results.bindings)
}

interface ExplorerContextValue extends ExplorerState {
  mainstemResource: ResourceState<GraphFeature[]>
  nodeResource: ResourceState<TripleRow[]>
  datasetsResource: ResourceState<DatasetSummary[]>
  searchResource: ResourceState<GraphFeature[]>
  sitemapEntriesResource: ResourceState<SitemapEntry[]>
  sitemapColorScale: SitemapColorScale
  // Sitemaps (raw `geoconnex_sitemap` values) whose features are hidden from the
  // selected mainstem's list and map layer. Scoped to one mainstem.
  hiddenSitemaps: ReadonlySet<string>
  basemap: BasemapId
  terrain3d: boolean
  // The mainstem the river runner started from, while it's running.
  riverRunner: { uri: string; name: string } | null
  flyToTarget: [number, number] | null
  fitTarget: Bbox | null
  // Where the place search last landed, marked on the map.
  placeMarker: [number, number] | null
  // The latest Analysis tab result, if it belongs to the selected mainstem.
  analysisResult: AnalysisResult | null
  // Whether the selected mainstem's path to the mouth has been traced, and that
  // path. Tracing is a one-off for the river it was run on, not a standing mode.
  showDownstreamPath: boolean
  downstreamPathResource: ResourceState<RunnerLeg[]>
  mapBounds: Bbox | null
  selectMainstem: (feature: MainstemFeatureProps) => void
  selectNode: (uri: string) => void
  clearNode: () => void
  runSearch: (params: FeatureSearchParams) => void
  flyTo: (lon: number, lat: number) => void
  fitBounds: (bbox: Bbox) => void
  setPlaceMarker: (point: [number, number] | null) => void
  setAnalysisResult: (result: AnalysisResult | null) => void
  setShowDownstreamPath: (show: boolean) => void
  reportMapBounds: (bounds: Bbox) => void
  toggleSitemap: (sitemap: string) => void
  showAllSitemaps: () => void
  setBasemap: (basemap: BasemapId) => void
  setTerrain3d: (on: boolean) => void
  startRiverRunner: (mainstem: { uri: string; name: string }) => void
  stopRiverRunner: () => void
}

const NO_HIDDEN_SITEMAPS: ReadonlySet<string> = new Set()

const ExplorerContext = createContext<ExplorerContextValue | null>(null)

export function ExplorerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const mainstemResource = useAsyncResource(
    state.selectedMainstem?.uri ?? null,
    loadMainstemFeatures,
  )
  const nodeResource = useAsyncResource(state.selectedNode, fetchOneHop)
  const datasetsResource = useAsyncResource(state.selectedNode, fetchDatasetSummaries)

  const sitemapEntriesResource = useAsyncResource('sitemaps', (_key, signal) =>
    fetchSitemapEntries(signal),
  )
  const sitemapColorScale = useMemo(
    () => buildSitemapColorScale(sitemapEntriesResource.data ?? []),
    [sitemapEntriesResource.data],
  )
  const [searchKey, setSearchKey] = useState<string | null>(null)
  const searchResource = useAsyncResource(searchKey, searchFeatures)

  const [hiddenSitemapsFor, setHiddenSitemapsFor] = useState<{
    mainstem: string
    hidden: ReadonlySet<string>
  } | null>(null)
  const mainstemUri = state.selectedMainstem?.uri ?? null
  const hiddenSitemaps =
    mainstemUri && hiddenSitemapsFor?.mainstem === mainstemUri
      ? hiddenSitemapsFor.hidden
      : NO_HIDDEN_SITEMAPS

  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP)
  const [terrain3d, setTerrain3d] = useState(false)
  const [riverRunner, setRiverRunner] = useState<{ uri: string; name: string } | null>(null)
  const [flyToTarget, setFlyToTarget] = useState<[number, number] | null>(null)
  const [fitTarget, setFitTarget] = useState<Bbox | null>(null)
  const [placeMarker, setPlaceMarker] = useState<[number, number] | null>(null)
  // Tagged with the mainstem it was run on, so picking another river drops it
  // instead of leaving a stale result on the map.
  const [analysis, setAnalysis] = useState<{ mainstem: string; result: AnalysisResult } | null>(
    null,
  )
  // The mainstem the downstream path was traced for. Picking another river
  // drops the path rather than tracing again, since each trace is heavy.
  const [downstreamPathMainstem, setDownstreamPathMainstem] = useState<string | null>(null)
  const showDownstreamPath =
    !!downstreamPathMainstem && downstreamPathMainstem === state.selectedMainstem?.uri
  const downstreamPathResource = useAsyncResource(
    showDownstreamPath ? downstreamPathMainstem : null,
    fetchDownstreamPath,
  )
  const analysisResult =
    analysis && analysis.mainstem === state.selectedMainstem?.uri ? analysis.result : null
  const [mapBounds, setMapBounds] = useState<Bbox | null>(null)

  const value = useMemo<ExplorerContextValue>(
    () => ({
      ...state,
      mainstemResource,
      nodeResource,
      datasetsResource,
      searchResource,
      sitemapEntriesResource,
      sitemapColorScale,
      hiddenSitemaps,
      basemap,
      terrain3d,
      riverRunner,
      flyToTarget,
      fitTarget,
      placeMarker,
      analysisResult,
      showDownstreamPath,
      downstreamPathResource,
      mapBounds,
      selectMainstem: (feature) => dispatch({ type: 'SELECT_MAINSTEM', feature }),
      selectNode: (uri) => dispatch({ type: 'SELECT_NODE', uri }),
      clearNode: () => dispatch({ type: 'CLEAR_NODE' }),
      runSearch: (params) => {
        const key = searchResourceKey(params)
        // A search result takes over the map — clear whatever mainstem/node
        // selection was showing so its features don't linger underneath.
        if (key) dispatch({ type: 'CLEAR_SELECTION' })
        setSearchKey(key)
      },
      flyTo: (lon, lat) => setFlyToTarget([lon, lat]),
      fitBounds: (bbox) => setFitTarget(bbox),
      setPlaceMarker,
      setShowDownstreamPath: (show) =>
        setDownstreamPathMainstem(show ? (state.selectedMainstem?.uri ?? null) : null),
      setAnalysisResult: (result) =>
        setAnalysis(
          result && state.selectedMainstem
            ? { mainstem: state.selectedMainstem.uri, result }
            : null,
        ),
      reportMapBounds: (bounds) => setMapBounds(bounds),
      toggleSitemap: (sitemap) => {
        if (!mainstemUri) return
        const next = new Set(hiddenSitemaps)
        if (next.has(sitemap)) next.delete(sitemap)
        else next.add(sitemap)
        setHiddenSitemapsFor({ mainstem: mainstemUri, hidden: next })
      },
      showAllSitemaps: () => setHiddenSitemapsFor(null),
      setBasemap,
      setTerrain3d,
      startRiverRunner: setRiverRunner,
      stopRiverRunner: () => setRiverRunner(null),
    }),
    [
      state,
      mainstemResource,
      nodeResource,
      datasetsResource,
      searchResource,
      sitemapEntriesResource,
      sitemapColorScale,
      hiddenSitemaps,
      mainstemUri,
      basemap,
      terrain3d,
      riverRunner,
      flyToTarget,
      fitTarget,
      placeMarker,
      analysisResult,
      showDownstreamPath,
      downstreamPathResource,
      mapBounds,
    ],
  )

  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>
}

export function useExplorer(): ExplorerContextValue {
  const ctx = useContext(ExplorerContext)
  if (!ctx) throw new Error('useExplorer must be used within an ExplorerProvider')
  return ctx
}
