import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { geocode, type Place } from '../lib/geocode'
import { useExplorer } from '../state/ExplorerContext'

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 0 0-9 0c0 3.8 4.5 8 4.5 8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="6.5" r="1.6" fill="currentColor" />
    </svg>
  )
}

/** Type-ahead place search that moves the map to the chosen place. */
export function PlaceSearch() {
  const { flyTo, fitBounds, setPlaceMarker } = useExplorer()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const trimmed = query.trim()
  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      geocode(trimmed, controller.signal)
        .then((results) => {
          setPlaces(results)
          setActive(-1)
          setError(null)
          setLoading(false)
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setError(e instanceof Error ? e.message : 'Place search failed')
          setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
      setLoading(false)
    }
  }, [trimmed])

  const showList = open && trimmed.length >= MIN_QUERY_LENGTH && (places.length > 0 || !!error)

  function choose(place: Place) {
    if (place.bbox) fitBounds(place.bbox)
    else flyTo(place.lon, place.lat)
    setPlaceMarker([place.lon, place.lat])
    setQuery(place.name)
    setOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && places.length) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % places.length)
    } else if (e.key === 'ArrowUp' && places.length) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? places.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      // Kept out of the feature search form below: Enter picks a place.
      e.preventDefault()
      const place = places[active] ?? places[0]
      if (place && showList) choose(place)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="place-search">
      <span className="place-search-icon">
        <PinIcon />
      </span>
      <input
        type="search"
        placeholder="Go to a place…"
        aria-label="Go to a place"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          // Clearing the box also clears the marker it placed.
          if (!e.target.value) setPlaceMarker(null)
        }}
        onFocus={() => setOpen(true)}
        // Delay so a click on a suggestion lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
      />
      {loading && <span className="spinner place-search-spinner" aria-label="Loading places" />}
      {showList && (
        <ul className="place-search-list" id={listId} role="listbox">
          {error ? (
            <li className="place-search-error">{error}</li>
          ) : (
            places.map((place, index) => (
              <li
                key={place.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? 'active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(place)}
                onMouseEnter={() => setActive(index)}
              >
                <span className="place-search-name">{place.name}</span>
                {place.detail && <span className="place-search-detail">{place.detail}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
