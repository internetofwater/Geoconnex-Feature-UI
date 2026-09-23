import type { ExpressionSpecification } from 'maplibre-gl'
import type { SitemapEntry } from './sitemaps'
import { normalizeSitemapId } from './sitemaps'

export const OTHER_SITEMAP_COLOR = '#8f8d85'

const SATURATION = 62
const LIGHTNESS = 46
const GOLDEN_ANGLE = 137.508 // maximizes hue separation between consecutive slots

export type SitemapColorScale = Map<string, string>

// A stable color per sitemap.xml `sitemap_id`, generated from the full ~43-entry
// list rather than the small hand-picked categorical palette, so a source keeps
// the same color everywhere in the app (map, legend, feature lists) regardless of
// which mainstem or search is showing it. With this many categories, some hues
// will inevitably sit close together for colorblind viewers — the legend's text
// labels (never color alone) are what keeps sources identifiable either way.
export function buildSitemapColorScale(entries: SitemapEntry[]): SitemapColorScale {
  const scale: SitemapColorScale = new Map()
  entries.forEach((entry, index) => {
    const hue = (index * GOLDEN_ANGLE) % 360
    scale.set(entry.id, `hsl(${hue.toFixed(1)} ${SATURATION}% ${LIGHTNESS}%)`)
  })
  return scale
}

export function colorForSitemap(
  sitemap: string | null | undefined,
  scale: SitemapColorScale,
): string {
  if (!sitemap) return OTHER_SITEMAP_COLOR
  return scale.get(normalizeSitemapId(sitemap)) ?? OTHER_SITEMAP_COLOR
}

export function sitemapColorExpression(scale: SitemapColorScale): ExpressionSpecification {
  const pairs = Array.from(scale.entries()).flatMap(([id, color]) => [id, color])
  return [
    'match',
    ['get', 'sitemap'],
    ...pairs,
    OTHER_SITEMAP_COLOR,
  ] as unknown as ExpressionSpecification
}
