import { useState } from 'react'
import { donationKindLabel } from '../shared/donations'
import type { DonationMethod, DonationPage, Viewer } from '../shared/types'
import { Link } from './ui'

function CopyButton({
  value,
  copied,
  onCopy,
}: {
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <button type="button" className="button ghost small" onClick={onCopy}>
      {copied ? 'Copied' : 'Copy handle'}
    </button>
  )
}

function MethodCard({
  method,
  copied,
  onCopy,
}: {
  method: DonationMethod
  copied: boolean
  onCopy: () => void
}) {
  return (
    <article className="donate-method">
      <div className="donate-method-head">
        <span className="donate-kind">{donationKindLabel(method.kind)}</span>
        <h3>{method.label}</h3>
      </div>
      <code className="donate-destination">{method.destination}</code>
      {method.note && <p className="hint">{method.note}</p>}
      <div className="donate-actions">
        {method.url && (
          <a
            className="button small"
            href={method.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open {method.label}
          </a>
        )}
        <CopyButton value={method.destination} copied={copied} onCopy={onCopy} />
      </div>
    </article>
  )
}

export function DonatePage({
  data,
  viewer,
}: {
  data: DonationPage
  viewer: Viewer | null
}) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(id)
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 2000)
    } catch {
      setCopied(null)
    }
  }

  return (
    <article className="donate-page">
      <header className="page-head">
        <p className="eyebrow">Support the work</p>
        <h1>Keep PublicLens independent</h1>
        <p className="lede">{data.settings.intro}</p>
      </header>

      <section className="donate-benefits" aria-label="Supporter benefits">
        <div className="donate-benefit">
          <span className="donate-benefit-mark" aria-hidden="true">
            ★
          </span>
          <h2>Supporter badge</h2>
          <p>
            A public marker next to your name. If you would rather stay low-key,
            hide it from your profile at any time.
          </p>
        </div>
        <div className="donate-benefit">
          <span className="donate-benefit-mark" aria-hidden="true">
            ◉
          </span>
          <h2>Supporter boards</h2>
          <p>
            Access to supporter-only boards when they are open, alongside the
            staff who keep the place running.
          </p>
        </div>
        <div className="donate-benefit">
          <span className="donate-benefit-mark" aria-hidden="true">
            ↗
          </span>
          <h2>No strings</h2>
          <p>
            Donations are voluntary. They do not buy moderation decisions,
            access to private records, or a different set of rules.
          </p>
        </div>
      </section>

      <section className="panel donate-methods-panel">
        <div className="panel-heading">
          <div>
            <h2>Ways to donate</h2>
            <p className="hint">
              Payments go directly to the owner through the provider you choose.
              PublicLens never handles your card or bank details.
            </p>
          </div>
        </div>

        {data.methods.length === 0 ? (
          <div className="empty-state">
            <p>Donation options are being set up. Check back soon.</p>
            {viewer?.staffRole === 'admin' && (
              <p>
                <Link href="/admin">Add payment methods in the admin panel.</Link>
              </p>
            )}
          </div>
        ) : (
          <div className="donate-methods">
            {data.methods.map((method) => (
              <MethodCard
                key={method.id}
                method={method}
                copied={copied === method.id}
                onCopy={() => void copy(method.destination, method.id)}
              />
            ))}
          </div>
        )}

        <div className="donate-memo">
          <strong>Make it easy to match your payment</strong>
          <p>{data.settings.memoNote}</p>
        </div>
      </section>

      <section className="panel">
        <h2>How Supporter status works</h2>
        <ol className="donate-steps">
          <li>Send a donation through one of the methods above.</li>
          <li>
            Include your PublicLens handle in the payment note so the owner can
            find your account.
          </li>
          <li>
            The owner checks the payment and grants Supporter status manually.
            There is no automatic checkout or subscription.
          </li>
          <li>
            Your badge appears on your profile and posts. You can hide it later
            in Edit profile.
          </li>
        </ol>
        <p className="hint">
          Supporter status does not expire on its own. The owner can revoke it
          if a payment is reversed or the status was granted in error.
        </p>
      </section>
    </article>
  )
}
