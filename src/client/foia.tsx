import { useState } from 'react'
import {
  FOIA_DISCLAIMER,
  FOIA_TEMPLATES,
  type FoiaJurisdiction,
  type FoiaTemplate,
} from '../shared/foia'

const FILTERS: (FoiaJurisdiction | 'All')[] = [
  'All',
  'Federal',
  'State',
  'Local',
]

function download(template: FoiaTemplate) {
  const blob = new Blob([`${template.title}\n\n${template.body}\n`], {
    type: 'text/plain;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${template.id}.txt`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function FoiaPage() {
  const [filter, setFilter] = useState<FoiaJurisdiction | 'All'>('All')
  const [copied, setCopied] = useState<string | null>(null)
  const templates = FOIA_TEMPLATES.filter(
    (template) => filter === 'All' || template.jurisdiction === filter,
  )

  async function copy(template: FoiaTemplate) {
    try {
      await navigator.clipboard.writeText(template.body)
      setCopied(template.id)
      setTimeout(() => setCopied((value) => (value === template.id ? null : value)), 2000)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="foia-page">
      <header className="page-head">
        <p className="eyebrow">Records room</p>
        <h1>FOIA library</h1>
        <p className="lede">
          Request templates for federal, state, and local records. Download a
          plain-text copy, fill in the brackets, and keep a sent copy.
        </p>
        <div className="foia-filters" role="group" aria-label="Filter templates">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className="chip-button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </header>

      <p className="foia-note">{FOIA_DISCLAIMER}</p>

      <ul className="foia-list">
        {templates.map((template) => (
          <li className="foia-card" key={template.id}>
            <div className="foia-card-head">
              <span className="flag">{template.jurisdiction}</span>
              <h2>{template.title}</h2>
              <span className="spacer" />
              <button
                type="button"
                className="button ghost small"
                onClick={() => void copy(template)}
              >
                {copied === template.id ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => download(template)}
              >
                Download .txt
              </button>
            </div>
            <p className="foia-summary">{template.summary}</p>
            <details className="foia-preview">
              <summary>Preview template</summary>
              <pre>{template.body}</pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}
