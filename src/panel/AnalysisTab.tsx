import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ANALYSES, type AnalysisId, type AnalysisParams } from '../analysis/analyses'
import { lineLengthKm } from '../analysis/geometry'
import { sitemapKey } from '../lib/features'
import type { RunnerLeg } from '../lib/riverRunner'
import { useExplorer } from '../state/ExplorerContext'

interface AnalysisOption {
  id: AnalysisId
  title: string
  description: string
  // Runs through WhiteboxTools, whose ~18 MB engine downloads on first use.
  whitebox?: boolean
}

const OPTIONS: AnalysisOption[] = [
  {
    id: 'riverDistance',
    title: 'River distance',
    description: 'Km upstream from the mouth for each feature.',
  },
  {
    id: 'hexbins',
    title: 'Density hexagons',
    description: 'Feature counts in a hexagon grid.',
    whitebox: true,
  },
]

const DEFAULT_PARAMS: AnalysisParams = { hexWidthKm: 5 }

function downstreamPathSummary(legs: RunnerLeg[]): string {
  const km = legs.reduce((sum, leg) => sum + lineLengthKm(leg.coords), 0)
  const last = legs[legs.length - 1]
  if (legs.length === 1) return `No river downstream; the ${last.name} is a terminus.`
  return `${Math.round(km).toLocaleString()} km through ${legs.length} rivers to the mouth of the ${last.name}.`
}

function NumberParam({
  label,
  value,
  onChange,
  min = 0.1,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
}) {
  return (
    <label className="analysis-param">
      {label}
      <input
        type="number"
        min={min}
        step="any"
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isFinite(next) && next >= min) onChange(next)
        }}
      />
    </label>
  )
}

export function AnalysisTab() {
  const {
    selectedMainstem,
    mainstemResource,
    hiddenSitemaps,
    analysisResult,
    setAnalysisResult,
    showDownstreamPath,
    setShowDownstreamPath,
    downstreamPathResource,
  } = useExplorer()
  const [params, setParams] = useState<AnalysisParams>(DEFAULT_PARAMS)
  // Both are tagged with the river they're for, so switching rivers makes them
  // lapse on their own.
  const [runState, setRunState] = useState<{
    mainstem: string
    id: AnalysisId
  } | null>(null)
  const [errorState, setErrorState] = useState<{
    mainstem: string
    id: AnalysisId
    message: string
  } | null>(null)
  const controller = useRef<AbortController | null>(null)

  // Leaving the tab, or switching rivers, abandons a run in progress.
  useEffect(() => {
    const current = controller
    return () => current.current?.abort()
  }, [selectedMainstem?.uri])

  if (!selectedMainstem) {
    return <p className="panel-status">Select a river on the map to analyze it.</p>
  }
  const running = runState?.mainstem === selectedMainstem.uri ? runState.id : null
  const error = errorState?.mainstem === selectedMainstem.uri ? errorState : null

  const features = (mainstemResource.data ?? []).filter(
    (feature) => !hiddenSitemaps.has(sitemapKey(feature)),
  )
  const tracing = showDownstreamPath && downstreamPathResource.status === 'loading'
  const featuresReady = mainstemResource.status === 'success' && features.length > 0

  async function run(id: AnalysisId) {
    if (!selectedMainstem) return
    const mainstem = selectedMainstem.uri
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setRunState({ mainstem, id })
    setErrorState(null)
    try {
      const result = await ANALYSES[id]({
        mainstem: selectedMainstem,
        features,
        params,
        signal: current.signal,
      })
      if (!current.signal.aborted) setAnalysisResult(result)
    } catch (e) {
      if (current.signal.aborted) return
      setErrorState({
        mainstem,
        id,
        message: e instanceof Error ? e.message : 'Analysis failed',
      })
    } finally {
      if (controller.current === current) setRunState(null)
    }
  }

  const setParam = <K extends keyof AnalysisParams>(key: K, value: AnalysisParams[K]) =>
    setParams((prev) => ({ ...prev, [key]: value }))

  const paramsFor = (id: AnalysisId): ReactNode =>
    id === 'hexbins' && (
      <NumberParam
        label="Hexagon width (km)"
        value={params.hexWidthKm}
        onChange={(v) => setParam('hexWidthKm', v)}
      />
    )

  const renderOption = (option: AnalysisOption) => {
    // Both analyses work on the river's associated features.
    const disabled = !!running || !featuresReady
    const isRunning = running === option.id
    const isActive = analysisResult?.id === option.id
    const optionParams = paramsFor(option.id)
    return (
      <li key={option.id} className={isActive ? 'analysis-option active' : 'analysis-option'}>
        <div className="analysis-option-header">
          <span className="analysis-option-text">
            <span className="analysis-option-title">{option.title}</span>
            <span className="analysis-option-description">{option.description}</span>
          </span>
          {/* One toggle per analysis: shows its result, or hides it if showing. */}
          <button
            type="button"
            className={isActive ? 'active' : ''}
            aria-pressed={isActive}
            onClick={() => (isActive ? setAnalysisResult(null) : run(option.id))}
            disabled={disabled}
          >
            {isRunning && <span className="spinner" aria-hidden="true" />}
            {isRunning ? 'Running' : isActive ? 'Hide' : 'Show'}
          </button>
        </div>
        {/* The result reads as a subheading of the analysis that produced it. */}
        {isActive && analysisResult && (
          <div className="analysis-result" aria-live="polite">
            <p>{analysisResult.summary}</p>
            {analysisResult.legend && (
              <ul className="analysis-legend">
                {analysisResult.legend.map((item) => (
                  <li key={item.label}>
                    <span className="analysis-swatch" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {optionParams && <div className="analysis-params">{optionParams}</div>}
        {isRunning && option.whitebox && (
          <p className="analysis-note">The first run loads the analysis engine (~5 MB).</p>
        )}
        {error?.id === option.id && (
          <p className="panel-status panel-status-error">{error.message}</p>
        )}
      </li>
    )
  }

  return (
    <div className="analysis-tab">
      <p className="analysis-target">
        <span>{selectedMainstem.name_at_outlet || 'Unnamed mainstem'}</span>
        {mainstemResource.status === 'success' &&
          ` · ${features.length.toLocaleString()} ${features.length === 1 ? 'feature' : 'features'}`}
      </p>

      {/* A one-off trace for this river, not a standing toggle: tracing is heavy,
          so picking another river drops the path instead of re-tracing. */}
      <div
        className={
          showDownstreamPath
            ? 'analysis-option analysis-downstream active'
            : 'analysis-option analysis-downstream'
        }
      >
        <div className="analysis-option-header">
          <span className="analysis-option-text">
            <span className="analysis-option-title">Downstream path to the mouth</span>
            {showDownstreamPath && downstreamPathResource.status === 'error' && (
              <span className="panel-status-error analysis-option-description">
                {downstreamPathResource.error}
              </span>
            )}
            {showDownstreamPath && downstreamPathResource.data ? (
              <span className="analysis-option-description">
                {downstreamPathSummary(downstreamPathResource.data)}
              </span>
            ) : (
              <span className="analysis-option-description">
                Trace this river to where it ends.
              </span>
            )}
          </span>
          <button
            type="button"
            className={showDownstreamPath ? 'active' : ''}
            aria-pressed={showDownstreamPath}
            onClick={() => setShowDownstreamPath(!showDownstreamPath)}
          >
            {tracing && <span className="spinner" aria-hidden="true" />}
            {tracing ? 'Tracing' : showDownstreamPath ? 'Hide' : 'Trace'}
          </button>
        </div>
      </div>

      <ul className="analysis-options">{OPTIONS.map(renderOption)}</ul>
    </div>
  )
}
