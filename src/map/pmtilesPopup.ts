// Built with the DOM rather than an HTML string: property values come from the
// exported data and must never be parsed as markup.
export function pmtilesPopupContent({
  title,
  color,
  properties,
  others,
}: {
  title: string
  color: string
  properties: Record<string, unknown>
  // How many more features are under the cursor.
  others: number
}): HTMLElement {
  const root = document.createElement('div')

  const header = root.appendChild(document.createElement('div'))
  header.className = 'pmtiles-popup-header'
  const swatch = header.appendChild(document.createElement('span'))
  swatch.className = 'legend-swatch'
  swatch.style.backgroundColor = color
  header.appendChild(document.createElement('span')).textContent = title

  const table = root.appendChild(document.createElement('table'))
  const entries = Object.entries(properties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]): [string, string] => [
      key,
      value === null || value === undefined ? '' : String(value),
    ])
  for (const [key, value] of entries) {
    const row = table.appendChild(document.createElement('tr'))
    row.appendChild(document.createElement('th')).textContent = key
    // Long values are clamped by CSS, which needs a block inside the cell.
    const cell = row.appendChild(document.createElement('td'))
    cell.appendChild(document.createElement('div')).textContent = value || '—'
  }
  if (entries.length === 0) {
    root.appendChild(document.createElement('p')).textContent = 'No properties'
  }

  if (others > 0) {
    const more = root.appendChild(document.createElement('p'))
    more.className = 'pmtiles-popup-more'
    more.textContent = `+${others} more feature${others === 1 ? '' : 's'} here`
  }

  return root
}
