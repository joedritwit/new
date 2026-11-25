import { useState, type FormEvent } from 'react'
import { POST_MIN_ROLES } from '../shared/forum'
import type {
  AdminBoard,
  AdminBoards,
  AdminCategory,
  AdminDonations,
  AdminSupporter,
  AuditEntry,
} from '../shared/types'
import { send } from './api'
import { DonationAdmin, SupporterAdmin } from './donations-admin'
import { RelativeTime } from './ui'

function useMutation(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(
    url: string,
    method: 'POST' | 'PATCH',
    body: unknown,
  ): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await send(url, method, body)
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, run }
}

export function AdminPage({
  data,
  donations,
  supporters,
  entries,
  onChanged,
}: {
  data: AdminBoards
  donations: AdminDonations
  supporters: AdminSupporter[]
  entries: AuditEntry[]
  onChanged: () => void
}) {
  return (
    <div className="staff-page">
      <header className="page-head">
        <p className="eyebrow">Admin</p>
        <h1>Boards, donations, and audit</h1>
        <p className="lede">
          Add, rename, reorder, archive, and set who can read or post. Manage
          donation methods and Supporter grants below. Changes are logged and
          take effect immediately.
        </p>
      </header>

      <NewCategoryForm onDone={onChanged} />

      {data.categories.map((category) => (
        <CategoryPanel
          key={category.id}
          category={category}
          onChanged={onChanged}
        />
      ))}

      <DonationAdmin data={donations} onChanged={onChanged} />
      <SupporterAdmin supporters={supporters} onChanged={onChanged} />

      <section className="panel">
        <h2>Audit log</h2>
        <p className="hint">Append-only. The newest 100 actions are shown.</p>
        {entries.length === 0 ? (
          <p className="empty-state">No staff actions recorded yet.</p>
        ) : (
          <ul className="audit-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <code>{entry.action}</code>
                <span>{entry.actor}</span>
                <span>
                  {entry.targetType} {entry.targetId}
                </span>
                {entry.reason && <span>“{entry.reason}”</span>}
                <span className="spacer" />
                <RelativeTime at={entry.createdAt} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function NewCategoryForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { busy, error, run } = useMutation(onDone)

  async function submit(event: FormEvent) {
    event.preventDefault()
    await run('/api/admin/categories', 'POST', {
      name,
      description,
    })
    setName('')
    setDescription('')
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>New category</h2>
      <div className="inline-form">
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Category name"
          aria-label="Category name"
          minLength={3}
          maxLength={60}
          required
        />
        <input
          className="input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="One line about it"
          aria-label="Category description"
          maxLength={200}
        />
        <button className="button" disabled={busy}>
          {busy ? 'Adding…' : 'Add category'}
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

function CategoryPanel({
  category,
  onChanged,
}: {
  category: AdminCategory
  onChanged: () => void
}) {
  const { busy, error, run } = useMutation(onChanged)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description)

  return (
    <section className="admin-category">
      <div className="admin-category-head">
        <div>
          <h2>{category.name}</h2>
          <p className="hint">{category.description || 'No description'}</p>
        </div>
        <div className="admin-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Move category up"
            disabled={busy}
            onClick={() =>
              void run(`/api/admin/categories/${category.id}/move`, 'POST', {
                direction: 'up',
              })
            }
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Move category down"
            disabled={busy}
            onClick={() =>
              void run(`/api/admin/categories/${category.id}/move`, 'POST', {
                direction: 'down',
              })
            }
          >
            ↓
          </button>
          <button
            type="button"
            className="button ghost small"
            onClick={() => setEditing((open) => !open)}
          >
            {editing ? 'Close' : 'Rename'}
          </button>
        </div>
      </div>

      {editing && (
        <form
          className="admin-board"
          onSubmit={async (event) => {
            event.preventDefault()
            await run(`/api/admin/categories/${category.id}`, 'PATCH', {
              name,
              description,
            })
            setEditing(false)
          }}
        >
          <div className="inline-form">
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Category name"
              minLength={3}
              maxLength={60}
              required
            />
            <input
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-label="Category description"
              maxLength={200}
            />
            <button className="button" disabled={busy}>
              Save
            </button>
          </div>
        </form>
      )}

      <ul className="admin-board-list">
        {category.boards.map((board) => (
          <BoardRow
            key={board.id}
            board={board}
            onChanged={onChanged}
          />
        ))}
      </ul>

      <NewBoardForm categoryId={category.id} onDone={onChanged} />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function BoardRow({
  board,
  onChanged,
}: {
  board: AdminBoard
  onChanged: () => void
}) {
  const { busy, error, run } = useMutation(onChanged)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(board.name)
  const [description, setDescription] = useState(board.description)
  const [staffOnly, setStaffOnly] = useState(board.staffOnly)
  const [postMinRole, setPostMinRole] = useState(board.postMinRole)

  return (
    <li className="admin-board">
      <div className="admin-row">
        <strong>{board.name}</strong>
        <code className="hint">/{board.id}</code>
        <span className="flag">
          {board.threadCount} {board.threadCount === 1 ? 'thread' : 'threads'}
        </span>
        {board.staffOnly && <span className="flag warn">staff read</span>}
        {board.postMinRole !== 'member' && (
          <span className="flag warn">post: {board.postMinRole}</span>
        )}
        {board.archived && <span className="flag warn">archived</span>}
        <div className="admin-actions">
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${board.name} up`}
          disabled={busy}
          onClick={() =>
            void run(`/api/admin/boards/${board.id}/move`, 'POST', {
              direction: 'up',
            })
          }
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${board.name} down`}
          disabled={busy}
          onClick={() =>
            void run(`/api/admin/boards/${board.id}/move`, 'POST', {
              direction: 'down',
            })
          }
        >
          ↓
        </button>
        <button
          type="button"
          className="button ghost small"
          onClick={() => setEditing((open) => !open)}
        >
          {editing ? 'Close' : 'Edit'}
        </button>
        <button
          type="button"
          className="button ghost small"
          disabled={busy}
          onClick={() =>
            void run(`/api/admin/boards/${board.id}`, 'PATCH', {
              archived: !board.archived,
            })
          }
        >
          {board.archived ? 'Restore' : 'Archive'}
        </button>
        </div>
      </div>

      {editing && (
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault()
            await run(`/api/admin/boards/${board.id}`, 'PATCH', {
              name,
              description,
              staffOnly,
              postMinRole,
            })
            setEditing(false)
          }}
        >
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Board name"
            minLength={3}
            maxLength={60}
            required
          />
          <input
            className="input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-label="Board description"
            maxLength={200}
          />
          <select
            className="select"
            value={postMinRole}
            onChange={(event) => setPostMinRole(event.target.value)}
            aria-label="Who can post"
          >
            {POST_MIN_ROLES.map((role) => (
              <option key={role} value={role}>
                post: {role}
              </option>
            ))}
          </select>
          <label className="hint admin-check">
            <input
              type="checkbox"
              checked={staffOnly}
              onChange={(event) => setStaffOnly(event.target.checked)}
            />
            staff-only read
          </label>
          <button className="button" disabled={busy}>
            Save
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

function NewBoardForm({
  categoryId,
  onDone,
}: {
  categoryId: string
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { busy, error, run } = useMutation(onDone)

  return (
    <form
      className="admin-board"
      onSubmit={async (event) => {
        event.preventDefault()
        await run('/api/admin/boards', 'POST', {
          categoryId,
          name,
          description,
        })
        setName('')
        setDescription('')
      }}
    >
      <div className="inline-form">
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New board"
          aria-label="New board name"
          minLength={3}
          maxLength={60}
          required
        />
        <input
          className="input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="One line about it"
          aria-label="New board description"
          maxLength={200}
        />
        <button className="button ghost" disabled={busy}>
          {busy ? 'Adding…' : 'Add board'}
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
