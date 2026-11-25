import { useState, type FormEvent } from 'react'
import { LIMITS } from '../shared/forum'
import { AttachImage } from './media'

export function Composer({
  initialValue = '',
  placeholder,
  submitLabel,
  hint,
  onSubmit,
}: {
  initialValue?: string
  placeholder: string
  submitLabel: string
  hint?: string
  onSubmit: (body: string) => Promise<void>
}) {
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!value.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(value.trim())
      setValue('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not post.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-head">
        <label className="field-label" htmlFor="composer-body">
          Reply
        </label>
        <span className="hint">Markdown supported</span>
      </div>
      <textarea
        id="composer-body"
        className="textarea"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        maxLength={LIMITS.bodyMax}
        disabled={busy}
      />
      {hint && <p className="hint">{hint}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="composer-foot">
        <div className="composer-tools">
          <AttachImage
            disabled={busy}
            onInsert={(markdown) => setValue((current) => `${current}${markdown}`)}
          />
          <span className="hint">
            {value.length}/{LIMITS.bodyMax}
          </span>
        </div>
        <button className="button" disabled={busy || !value.trim()}>
          {busy ? 'Posting…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
