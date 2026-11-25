import { useState } from 'react'
import { REPORT_REASONS } from '../shared/forum'
import type {
  ModBoard,
  ModQueue,
  ReportStatus,
  ReportView,
} from '../shared/types'
import { send } from './api'
import { ImagePicker } from './media'
import { Link, RelativeTime } from './ui'

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'in_review', label: 'In review' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
] as const

type Filter = (typeof FILTERS)[number]['id']

function matches(status: ReportStatus, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'closed') return status === 'resolved' || status === 'dismissed'
  return status === filter
}

const REASON_LABELS = new Map<string, string>(
  REPORT_REASONS.map((reason) => [reason.value, reason.label]),
)

export function ModQueuePage({
  data,
  boards,
  onChanged,
  onBoardsChanged,
}: {
  data: ModQueue
  boards: ModBoard[]
  onChanged: () => void
  onBoardsChanged: () => void
}) {
  const [filter, setFilter] = useState<Filter>('open')
  const reports = data.reports.filter((report) => matches(report.status, filter))

  return (
    <div className="staff-page">
      <header className="page-head">
        <p className="eyebrow">Staff</p>
        <h1>Report queue</h1>
        <p className="lede">
          {data.counts.open} open · {data.counts.inReview} in review. Every
          action is written to the audit log with your account attached.
        </p>
      </header>

      <div className="tab-row" role="tablist" aria-label="Report filters">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={filter === option.id}
            className={`tab${filter === option.id ? ' active' : ''}`}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
            {option.id === 'open' && data.counts.open > 0
              ? ` (${data.counts.open})`
              : ''}
          </button>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="empty-state">Nothing in this queue.</p>
      ) : (
        <ul className="report-list">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <BoardBanners boards={boards} onChanged={onBoardsChanged} />
    </div>
  )
}

function BoardBanners({
  boards,
  onChanged,
}: {
  boards: ModBoard[]
  onChanged: () => void
}) {
  const [error, setError] = useState('')

  async function attach(boardId: string, mediaId: string | null) {
    setError('')
    try {
      await send(`/api/mod/boards/${boardId}/image`, 'PATCH', { mediaId })
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    }
  }

  return (
    <details className="panel board-banners">
      <summary>
        <span>Board banners</span>
        <span className="hint">{boards.filter((board) => board.imageMediaId).length} set</span>
      </summary>
      <p className="hint">
        A banner is private or public with its board. Images are cropped,
        stripped, and stored small.
      </p>
      <ul className="admin-board-list">
        {boards.map((board) => (
          <li className="admin-row banner-row" key={board.id}>
            {board.imageMediaId ? (
              <img
                className="banner-thumb"
                src={`/api/files/${board.imageMediaId}`}
                alt=""
              />
            ) : (
              <span className="banner-thumb empty" aria-hidden="true" />
            )}
            <span>{board.name}</span>
            {board.staffOnly && <span className="flag warn">staff read</span>}
            <span className="spacer" />
            <ImagePicker
              label={board.imageMediaId ? 'Replace' : 'Upload'}
              kind="board_banner"
              onUploaded={(media) => attach(board.id, media.id)}
            />
            {board.imageMediaId && (
              <button
                type="button"
                className="button ghost small"
                onClick={() => void attach(board.id, null)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  )
}

function ReportCard({
  report,
  onChanged,
}: {
  report: ReportView
  onChanged: () => void
}) {
  const [note, setNote] = useState('')
  const [points, setPoints] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warnOpen, setWarnOpen] = useState(false)
  const closed = report.status === 'resolved' || report.status === 'dismissed'

  async function act(action: string) {
    if (action === 'warn_user' && !note.trim()) {
      setError('A warning needs a reason.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await send(`/api/mod/reports/${report.id}/action`, 'POST', {
        action,
        note: note.trim(),
        points,
      })
      setNote('')
      setWarnOpen(false)
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not act on it.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="report-card">
      <div className="report-head">
        <span className="status-chip" data-status={report.status}>
          {report.status.replace('_', ' ')}
        </span>
        <strong>{REASON_LABELS.get(report.reason) ?? report.reason}</strong>
        <span aria-hidden="true" className="dot" />
        <RelativeTime at={report.createdAt} />
        {report.handledAt && (
          <>
            <span aria-hidden="true" className="dot" />
            <span>handled {report.resolution}</span>
          </>
        )}
      </div>

      <blockquote className="report-post">{report.post.excerpt}</blockquote>

      <p className="report-meta">
        <span>
          by{' '}
          <Link href={`/u/${report.author.handle}`}>
            {report.author.name}
          </Link>
        </span>
        <span>
          in <Link href={`/t/${report.thread.slug}`}>{report.thread.title}</Link>
        </span>
        <span>{report.board.name}</span>
        <span>reported by @{report.reporter.handle}</span>
      </p>

      {report.details && <p className="hint">“{report.details}”</p>}
      {report.post.status === 'removed' && (
        <p className="hint">This post is currently removed.</p>
      )}

      {!closed && (
        <div className="report-actions">
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reason for the action (required for a warning)"
            aria-label="Reason for the action"
          />
          <button
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={() => void act('claim')}
          >
            Claim
          </button>
          <button
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={() => void act('dismiss')}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={() => void act('remove_post')}
          >
            Remove post
          </button>
          <button
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={() => void act('lock_thread')}
          >
            Lock thread
          </button>
          <button
            type="button"
            className="button danger"
            disabled={busy}
            onClick={() => setWarnOpen((open) => !open)}
          >
            Warn
          </button>
        </div>
      )}

      {warnOpen && !closed && (
        <div className="inline-form">
          <label className="hint" htmlFor={`points-${report.id}`}>
            Points
          </label>
          <select
            id={`points-${report.id}`}
            className="select"
            value={points}
            onChange={(event) => setPoints(Number(event.target.value))}
          >
            <option value={1}>1 point</option>
            <option value={2}>2 points</option>
            <option value={3}>3 points (auto-mute)</option>
          </select>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void act('warn_user')}
          >
            {busy ? 'Working…' : 'Issue warning'}
          </button>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
