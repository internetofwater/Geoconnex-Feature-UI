import './app-shell.css'
import { ErrorBoundary } from './ErrorBoundary'
import { MapView } from './map/MapView'
import { NodePanel } from './panel/NodePanel'
import { SidePanel } from './panel/SidePanel'
import { SitemapsWidget } from './panel/SitemapsWidget'
import { ExplorerProvider } from './state/ExplorerContext'

const MAP_FALLBACK = (
  <div className="map-view map-view-error">
    <p>The map couldn't load — this browser may not support WebGL2.</p>
  </div>
)

function App() {
  return (
    <ExplorerProvider>
      <div className="app-shell">
        <ErrorBoundary fallback={MAP_FALLBACK}>
          <MapView />
        </ErrorBoundary>
        <SidePanel />
        <NodePanel />
        <SitemapsWidget />
      </div>
    </ExplorerProvider>
  )
}

export default App
