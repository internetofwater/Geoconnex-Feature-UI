import { useId, useState, type KeyboardEvent } from 'react'
import type { SitemapEntry } from '../lib/sitemaps'
import { useExplorer } from '../state/ExplorerContext'

const ALL_SOURCES = 'All sources'

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The feature search's source filter: a combobox that shows the chosen
 * sitemap, and on focus lists them all to filter by id or description.
 * An empty `value` means all sources.
 */
export function SourcePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (sitemapId: string) => void
}) {
  const { sitemapEntriesResource, sitemapColorScale } = useExplorer()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const entries = sitemapEntriesResource.data ?? []
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? entries.filter((entry) =>
        `${entry.id} ${entry.description ?? ''}`.toLowerCase().includes(needle),
      )
    : entries
  // "All sources" leads the list until something is typed.
  const options: (SitemapEntry | null)[] = needle ? matches : [null, ...matches]

  function openList() {
    setQuery('')
    setActive(0)
    setOpen(true)
  }

  function choose(option: SitemapEntry | null) {
    onChange(option?.id ?? '')
    setOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) openList()
      else if (options.length) setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp' && open && options.length) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1))
    } else if (e.key === 'Enter' && open) {
      // Picks a source rather than submitting the search form.
      e.preventDefault()
      if (active < options.length) choose(options[active])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }

  const disabled = sitemapEntriesResource.status !== 'success'
  return (
    <div className="source-picker">
      <input
        type="text"
        role="combobox"
        aria-label="Source"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options.length ? `${listId}-${active}` : undefined}
        // Closed, it shows the chosen source; open, what's being typed.
        value={open ? query : value || ALL_SOURCES}
        placeholder={value || ALL_SOURCES}
        disabled={disabled}
        onFocus={openList}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        // Delay so a click on an option lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
      />
      <span className="source-picker-chevron">
        <ChevronIcon />
      </span>
      {open && (
        <ul className="source-picker-list" id={listId} role="listbox">
          {options.length === 0 && <li className="source-picker-empty">No sources match</li>}
          {options.map((option, index) => (
            <li
              key={option?.id ?? ''}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={(option?.id ?? '') === value}
              className={index === active ? 'active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
              onMouseEnter={() => setActive(index)}
            >
              {option ? (
                <>
                  <span
                    className="legend-swatch"
                    style={{ backgroundColor: sitemapColorScale.get(option.id) }}
                  />
                  <span className="source-picker-text">
                    <span className="source-picker-id">{option.id}</span>
                    {option.description && (
                      <span className="source-picker-description">{option.description}</span>
                    )}
                  </span>
                </>
              ) : (
                <span className="source-picker-text">
                  <span className="source-picker-id">{ALL_SOURCES}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
