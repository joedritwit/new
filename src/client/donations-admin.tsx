import { useEffect, useState, type FormEvent } from 'react'
import {
  DONATION_KINDS,
  DONATION_LIMITS,
  donationKindLabel,
} from '../shared/donations'
import type {
  AdminDonations,
  AdminSupporter,
  DonationKind,
  DonationMethod,
} from '../shared/types'
import { send } from './api'
import { RelativeTime } from './ui'

function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
  ): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      await send(url, method, body)
      onDone()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, setError, run }
}

function MethodRow({
  method,
  onChanged,
}: {
  method: DonationMethod
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [kind, setKind] = useState<DonationKind>(method.kind)
  const [label, setLabel] = useState(method.label)
  const [destination, setDestination] = useState(method.destination)
  const [url, setUrl] = useState(method.url ?? '')
  const [note, setNote] = useState(method.note ?? '')
  const [enabled, setEnabled] = useState(method.enabled)
  const { busy, error, run } = useAction(onChanged)

  useEffect(() => {
    setKind(method.kind)
    setLabel(method.label)
    setDestination(method.destination)
    setUrl(method.url ?? '')
    setNote(method.note ?? '')
    setEnabled(method.enabled)
  }, [method])

  async function save(event: FormEvent) {
    event.preventDefault()
    const saved = await run(`/api/admin/donations/methods/${method.id}`, 'PATCH', {
      kind,
      label,
      destination,
      url: url.trim() || null,
      note: note.trim() || null,
      enabled,
    })
    if (saved) setEditing(false)
  }

  return (
    <li className={`admin-method${method.enabled ? '' : ' is-disabled'}`}>
      <div className="admin-method-summary">
        <span className="donate-kind">{donationKindLabel(method.kind)}</span>
        <strong>{method.label}</strong>
        <code>{method.destination}</code>
        {method.note && <span className="hint">{method.note}</span>}
        <span className="spacer" />
        <span className="flag">{method.enabled ? 'live' : 'hidden'}</span>
        <button
          type="button"
          className="quiet-link"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? 'Close' : 'Edit'}
        </button>
        <button
          type="button"
          className="quiet-link"
          disabled={busy}
          onClick={() => void run(`/api/admin/donations/methods/${method.id}`, 'PATCH', {
            enabled: !method.enabled,
          })}
        >
          {method.enabled ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          className="quiet-link"
          disabled={busy}
          onClick={() => void run(`/api/admin/donations/methods/${method.id}/move`, 'POST', {
            direction: 'up',
          })}
        >
          ↑
        </button>
        <button
          type="button"
          className="quiet-link"
          disabled={busy}
          onClick={() => void run(`/api/admin/donations/methods/${method.id}/move`, 'POST', {
            direction: 'down',
          })}
        >
          ↓
        </button>
        <button
          type="button"
          className="quiet-link danger-text"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`Delete the ${method.label} payment method?`)) return
            void run(`/api/admin/donations/methods/${method.id}`, 'DELETE')
          }}
        >
          Delete
        </button>
      </div>

      {editing && (
        <form className="admin-method-form" onSubmit={save}>
          <select
            className="select"
            value={kind}
            onChange={(event) => setKind(event.target.value as DonationKind)}
            aria-label="Payment method type"
          >
            {DONATION_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label"
            aria-label="Payment method label"
            maxLength={DONATION_LIMITS.labelMax}
            required
          />
          <input
            className="input"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Public handle or address"
            aria-label="Payment destination"
            maxLength={DONATION_LIMITS.destinationMax}
            required
          />
          <input
            className="input"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https:// payment link (optional)"
            aria-label="Payment link"
            maxLength={DONATION_LIMITS.urlMax}
          />
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Short public note (optional)"
            aria-label="Payment note"
            maxLength={DONATION_LIMITS.noteMax}
          />
          <label className="hint admin-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Visible on the donation page
          </label>
          <button className="button" disabled={busy}>
            {busy ? 'Saving…' : 'Save method'}
          </button>
        </form>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

function AddMethod({ onChanged }: { onChanged: () => void }) {
  const [kind, setKind] = useState<DonationKind>('paypal')
  const [label, setLabel] = useState('')
  const [destination, setDestination] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [enabled, setEnabled] = useState(true)
  const { busy, error, run } = useAction(onChanged)
  const preset = DONATION_KINDS.find((option) => option.value === kind)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const saved = await run('/api/admin/donations/methods', 'POST', {
      kind,
      label,
      destination,
      url: url.trim() || null,
      note: note.trim() || null,
      enabled,
    })
    if (!saved) return
    setLabel('')
    setDestination('')
    setUrl('')
    setNote('')
  }

  return (
    <form className="admin-add-method" onSubmit={submit}>
      <h3>Add a payment method</h3>
      <div className="admin-method-form">
        <select
          className="select"
          value={kind}
          onChange={(event) => setKind(event.target.value as DonationKind)}
          aria-label="New payment method type"
        >
          {DONATION_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          className="input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label, e.g. PayPal"
          aria-label="New payment method label"
          maxLength={DONATION_LIMITS.labelMax}
          required
        />
        <input
          className="input"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder={preset?.destinationHint ?? 'Public handle or address'}
          aria-label="New payment destination"
          maxLength={DONATION_LIMITS.destinationMax}
          required
        />
        <input
          className="input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={preset?.linkHint ?? 'https:// payment link (optional)'}
          aria-label="New payment link"
          maxLength={DONATION_LIMITS.urlMax}
        />
        <input
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Short public note (optional)"
          aria-label="New payment note"
          maxLength={DONATION_LIMITS.noteMax}
        />
        <label className="hint admin-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Visible on the donation page
        </label>
        <button className="button" disabled={busy || !label.trim() || !destination.trim()}>
          {busy ? 'Adding…' : 'Add method'}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

export function DonationAdmin({
  data,
  onChanged,
}: {
  data: AdminDonations
  onChanged: () => void
}) {
  const [intro, setIntro] = useState(data.settings.intro)
  const [memoNote, setMemoNote] = useState(data.settings.memoNote)
  const { busy, error, run } = useAction(onChanged)

  useEffect(() => {
    setIntro(data.settings.intro)
    setMemoNote(data.settings.memoNote)
  }, [data.settings])

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    await run('/api/admin/donations/settings', 'PATCH', { intro, memoNote })
  }

  return (
    <section className="panel" id="donations">
      <h2>Donations</h2>
      <p className="hint">
        These details are public. Use payment handles or payment links only —
        never bank account or routing numbers, passwords, or recovery codes.
        Changes are audited and take effect immediately.
      </p>

      <form className="donation-settings-form" onSubmit={saveSettings}>
        <div className="field">
          <label className="field-label" htmlFor="donation-intro">
            Donation page intro
          </label>
          <textarea
            id="donation-intro"
            className="textarea short"
            value={intro}
            onChange={(event) => setIntro(event.target.value)}
            maxLength={DONATION_LIMITS.introMax}
            required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="donation-memo">
            Payment memo instruction
          </label>
          <input
            id="donation-memo"
            className="input"
            value={memoNote}
            onChange={(event) => setMemoNote(event.target.value)}
            maxLength={DONATION_LIMITS.memoMax}
            placeholder="Include your @handle in the payment note…"
          />
        </div>
        <div className="admin-row">
          <span className="hint">
            Supporters send money directly; you grant status after confirming it.
          </span>
          <span className="spacer" />
          <button className="button" disabled={busy || !intro.trim()}>
            {busy ? 'Saving…' : 'Save donation settings'}
          </button>
        </div>
      </form>

      <h3>Payment methods</h3>
      {data.methods.length === 0 ? (
        <p className="empty-state">No payment methods yet.</p>
      ) : (
        <ul className="admin-method-list">
          {data.methods.map((method) => (
            <MethodRow key={method.id} method={method} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <AddMethod onChanged={onChanged} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

export function SupporterAdmin({
  supporters,
  onChanged,
}: {
  supporters: AdminSupporter[]
  onChanged: () => void
}) {
  const [handle, setHandle] = useState('')
  const [note, setNote] = useState('')
  const { busy, error, run } = useAction(onChanged)

  async function grant(event: FormEvent) {
    event.preventDefault()
    const saved = await run('/api/admin/supporters', 'POST', {
      handle,
      action: 'grant',
      note: note.trim() || null,
    })
    if (!saved) return
    setHandle('')
    setNote('')
  }

  async function revoke(supporter: AdminSupporter) {
    if (
      !window.confirm(
        `Remove Supporter status from @${supporter.handle}? Their supporter-board access will end.`,
      )
    )
      return
    await run('/api/admin/supporters', 'POST', {
      handle: supporter.handle,
      action: 'revoke',
    })
  }

  return (
    <section className="panel" id="supporters">
      <h2>Supporters</h2>
      <p className="hint">
        Grant Supporter status manually after a payment arrives. Grants do not
        expire; revoke one here if it was a mistake or the payment was reversed.
        Staff accounts cannot be changed from this panel.
      </p>

      <form className="supporter-grant-form" onSubmit={grant}>
        <input
          className="input"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="@handle"
          aria-label="Member handle"
          maxLength={24}
          required
        />
        <input
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note for the audit log"
          aria-label="Supporter grant note"
          maxLength={200}
        />
        <button className="button" disabled={busy || !handle.trim()}>
          {busy ? 'Updating…' : 'Grant Supporter'}
        </button>
      </form>

      {supporters.length === 0 ? (
        <p className="empty-state">No Supporters yet.</p>
      ) : (
        <ul className="admin-supporter-list">
          {supporters.map((supporter) => (
            <li key={supporter.id}>
              <strong>{supporter.name}</strong>
              <span className="hint">@{supporter.handle}</span>
              <span className={`flag${supporter.showSupporterBadge ? '' : ' warn'}`}>
                {supporter.showSupporterBadge ? 'badge on' : 'badge hidden'}
              </span>
              <span className="hint">
                joined <RelativeTime at={supporter.joinedAt} />
              </span>
              <span className="spacer" />
              <button
                type="button"
                className="quiet-link danger-text"
                disabled={busy}
                onClick={() => void revoke(supporter)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
