export interface SitemapEntry {
  id: string
  description?: string
}

const SITEMAP_INDEX_URL = 'https://geoconnex.us/sitemap.xml'

export async function fetchSitemapEntries(signal: AbortSignal): Promise<SitemapEntry[]> {
  const response = await fetch(SITEMAP_INDEX_URL, { signal })
  if (!response.ok) {
    throw new Error(`Sitemap index request failed: ${response.status} ${response.statusText}`)
  }

  const xmlText = await response.text()
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')

  const entries: SitemapEntry[] = []
  for (const node of Array.from(doc.getElementsByTagName('sitemap'))) {
    const id = node.getElementsByTagName('geoconnex:sitemap_id')[0]?.textContent?.trim()
    if (!id) continue
    const description = node
      .getElementsByTagName('geoconnex:dataset_description')[0]
      ?.textContent?.trim()
    entries.push({ id, description: description || undefined })
  }

  entries.sort((a, b) => a.id.localeCompare(b.id))
  return entries
}

// Bulk-integrated sources carry a `bulk:` prefix on the feature's `geoconnex_sitemap`
// property that the sitemap.xml `sitemap_id` (what this file otherwise deals in) doesn't
// have, e.g. feature property `bulk:usgs:sciencebase` vs. sitemap_id `usgs:sciencebase`.
export function normalizeSitemapId(id: string): string {
  return id.replace(/^bulk:/, '')
}
