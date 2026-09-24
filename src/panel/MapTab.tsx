import { BASEMAPS } from '../map/basemaps'
import { useExplorer } from '../state/ExplorerContext'

export function MapTab() {
  const { basemap, setBasemap, terrain3d, setTerrain3d } = useExplorer()

  return (
    <div className="map-tab">
      <fieldset className="basemap-picker">
        <legend>Basemap</legend>
        {BASEMAPS.map((option) => (
          <label
            key={option.id}
            className={option.id === basemap ? 'basemap-option active' : 'basemap-option'}
          >
            <input
              type="radio"
              name="basemap"
              value={option.id}
              checked={option.id === basemap}
              onChange={() => setBasemap(option.id)}
            />
            <span className="basemap-option-text">
              <span className="basemap-option-label">{option.label}</span>
              <span className="basemap-option-description">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="basemap-picker">
        <legend>Terrain</legend>
        <label className={terrain3d ? 'basemap-option active' : 'basemap-option'}>
          <input
            type="checkbox"
            checked={terrain3d}
            onChange={(e) => setTerrain3d(e.target.checked)}
          />
          <span className="basemap-option-text">
            <span className="basemap-option-label">3D terrain</span>
            <span className="basemap-option-description">
              Elevation with hillshading. Right-drag or Ctrl-drag to tilt and rotate.
            </span>
          </span>
        </label>
      </fieldset>
    </div>
  )
}
