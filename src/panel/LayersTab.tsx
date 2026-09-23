import { SitemapsList } from './SitemapsList'

// Each map layer is one Geoconnex sitemap source, so the sitemap legend doubles
// as the layer list until the toggles exist.
export function LayersTab() {
  return (
    <div className="layers-tab">
      <p className="panel-status layers-coming-soon">
        Coming soon: toggle each of these PMTiles layers on and off on the map.
      </p>
      <SitemapsList />
    </div>
  )
}
