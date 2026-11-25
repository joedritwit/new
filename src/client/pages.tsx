import { useState, type FormEvent } from 'react'
import {
  AVATAR_COLORS,
  LIMITS,
  ROLE_TAGS,
  THREAD_PREFIXES,
} from '../shared/forum'
import type {
  BoardDetail,
  ProfileView,
  Session,
  Viewer,
} from '../shared/types'
import { navigate, send } from './api'
import { Composer } from './composer'
import { AttachImage, ImagePicker } from './media'
import {
  Avatar,
  Link,
  Prefix,
  RelativeTime,
  RoleBadge,
  TrustLabel,
  numberFormat,
} from './ui'

function SignInNote({ authMode }: { authMode: Session['mode'] }) {
  if (authMode !== 'freebuff')
    return <p className="signin-note">Sign-in is not configured for this build.</p>
  return (
    <p className="signin-note">
      <a href="/auth/freebuff/signin?returnTo=%2F">Sign in</a> to post.
    </p>
  )
}

export function BoardView({
  data,
  viewer,
}: {
  data: BoardDetail
  viewer: Viewer | null
}) {
  const { board, category, threads } = data

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Boards</Link>
        <span className="crumb-sep" aria-hidden="true">
          /
        </span>
        <span>{category.name}</span>
      </nav>

      {board.imageMediaId && (
        <img
          className="board-banner"
          src={`/api/files/${board.imageMediaId}`}
          alt=""
        />
      )}

      <header className="page-head board-head">
        <div>
          <p className="eyebrow">{category.name}</p>
          <h1>{board.name}</h1>
          <p className="lede">{board.description}</p>
        </div>
        {viewer && !board.archived && (
          <Link className="button" href={`/b/${board.id}/new`}>
            New thread
          </Link>
        )}
      </header>

      {board.archived && (
        <p className="notice-inline">
          This board is archived. Threads stay readable; posting is closed.
        </p>
      )}

      {threads.length === 0 ? (
        <p className="empty-state">
          No threads here yet. The first one is yours.
        </p>
      ) : (
        <ul className="thread-list">
          {threads.map((thread) => (
            <li className="thread-row" key={thread.slug}>
              <div className="thread-row-main">
                <div className="thread-row-title">
                  {thread.prefix && <Prefix value={thread.prefix} />}
                  <Link href={`/t/${thread.slug}`}>{thread.title}</Link>
                  {thread.isPinned && <span className="label">Pinned</span>}
                  {thread.isLocked && <span className="label">Locked</span>}
                </div>
                <div className="thread-row-meta">
                  <Avatar person={thread.author} size={20} />
                  <Link href={`/u/${thread.author.handle}`}>
                    {thread.author.name}
                  </Link>
                  <span aria-hidden="true" className="dot" />
                  <span>
                    {numberFormat.format(thread.replyCount)}{' '}
                    {thread.replyCount === 1 ? 'reply' : 'replies'}
                  </span>
                </div>
              </div>
              <div className="thread-row-latest">
                <RelativeTime at={thread.lastActivityAt} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function NewThreadView({
  data,
  viewer,
  authMode,
}: {
  data: BoardDetail
  viewer: Viewer | null
  authMode: Session['mode']
}) {
  const [title, setTitle] = useState('')
  const [prefix, setPrefix] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!viewer) {
    return (
      <>
        <BackToBoard board={data.board} />
        <SignInNote authMode={authMode} />
      </>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await send<{ slug: string }>('/api/threads', 'POST', {
        boardId: data.board.id,
        title: title.trim(),
        prefix: prefix || null,
        body,
      })
      navigate(`/t/${result.slug}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not post.')
      setBusy(false)
    }
  }

  return (
    <>
      <BackToBoard board={data.board} />
      <form className="composer" onSubmit={submit}>
        <h1 className="form-title">New thread in {data.board.name}</h1>
        <div className="field">
          <label className="field-label" htmlFor="thread-title">
            Title
          </label>
          <input
            id="thread-title"
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={LIMITS.titleMin}
            maxLength={LIMITS.titleMax}
            required
            placeholder="What happened, in one line"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="thread-prefix">
            Prefix
          </label>
          <select
            id="thread-prefix"
            className="select"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
          >
            <option value="">No prefix</option>
            {THREAD_PREFIXES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="thread-body">
            Post
          </label>
          <textarea
            id="thread-body"
            className="textarea"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            minLength={1}
            maxLength={LIMITS.bodyMax}
            required
            placeholder="What happened, what you tried, and what you would do differently. Markdown and YouTube, Rumble, Vimeo, PeerTube, or Archive.org links are supported. Timestamps like 12:34 become seek links."
          />
        </div>
        {viewer.trustLevel === 0 && (
          <p className="hint">
            New accounts cannot post links yet. Three posts and 24 hours unlock
            them.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="composer-foot">
          <div className="composer-tools">
            <AttachImage
              disabled={busy}
              onInsert={(markdown) => setBody((current) => `${current}${markdown}`)}
            />
            <Link className="button ghost" href={`/b/${data.board.id}`}>
              Cancel
            </Link>
          </div>
          <button
            className="button"
            disabled={busy || !title.trim() || !body.trim()}
          >
            {busy ? 'Posting…' : 'Post thread'}
          </button>
        </div>
      </form>
    </>
  )
}

function BackToBoard({ board }: { board: { id: string; name: string } }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link href="/">Boards</Link>
      <span className="crumb-sep" aria-hidden="true">
        /
      </span>
      <Link href={`/b/${board.id}`}>{board.name}</Link>
    </nav>
  )
}

export function ProfilePage({
  data,
  viewer,
  onSaved,
}: {
  data: ProfileView
  viewer: Viewer | null
  onSaved: () => void
}) {
  const own = viewer?.id === data.user.id

  return (
    <article className="profile">
      <header className="profile-head">
        <Avatar person={data.user} size={74} />
        <div className="profile-identity">
          <div className="profile-name-row">
            <h1>{data.user.name}</h1>
            <RoleBadge
              role={data.user.staffRole}
              showSupporterBadge={data.user.showSupporterBadge}
            />
            <TrustLabel level={data.user.trustLevel} />
          </div>
          <p className="profile-handle">
            @{data.user.handle}
            {data.user.roleTag && (
              <span className="tag profile-tag">{data.user.roleTag}</span>
            )}
          </p>
          <p className="profile-meta">
            Joined <RelativeTime at={data.user.joinedAt} />
            <span aria-hidden="true" className="dot" />
            {numberFormat.format(data.stats.threads)} threads
            <span aria-hidden="true" className="dot" />
            {numberFormat.format(data.stats.posts)} posts
          </p>
        </div>
      </header>

      {data.user.bio && <p className="profile-bio">{data.user.bio}</p>}

      <section className="profile-section">
        <h2>Recent activity</h2>
        {data.recent.length === 0 ? (
          <p className="empty-state">No posts yet.</p>
        ) : (
          <ul className="activity-list">
            {data.recent.map((item) => (
              <li key={item.id}>
                <Link href={`/t/${item.threadSlug}`}>{item.threadTitle}</Link>
                <p>{item.excerpt}</p>
                <span className="hint">
                  <RelativeTime at={item.at} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.staff && <StaffSection profile={data} onChanged={onSaved} />}

      {own && <ProfileEditor profile={data} onSaved={onSaved} />}
    </article>
  )
}

function StaffSection({
  profile,
  onChanged,
}: {
  profile: ProfileView
  onChanged: () => void
}) {
  const staff = profile.staff!
  const [points, setPoints] = useState(2)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')

  async function run(url: string, body: unknown) {
    setBusy(true)
    setError('')
    try {
      await send(url, 'POST', body)
      setReason('')
      setNote('')
      setRevoking(null)
      setRevokeReason('')
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="staff-section">
      <h2>Staff tools</h2>
      <p className="hint">
        {staff.activePoints} active warning points
        {staff.mutedUntil && staff.mutedUntil > Date.now() ? (
          <>
            {' '}
            · muted until{' '}
            {new Date(staff.mutedUntil).toISOString().slice(0, 16).replace('T', ' ')} UTC
          </>
        ) : (
          ' · not muted'
        )}
        . Three active points trigger a 24-hour mute.
      </p>

      {staff.warnings.length === 0 ? (
        <p className="hint">No warnings on this account.</p>
      ) : (
        <ul className="activity-list">
          {staff.warnings.map((warning) => (
            <li key={warning.id}>
              <div className="admin-row">
                <span className="flag warn">{warning.points} pts</span>
                <span>{warning.reason}</span>
                <span className="spacer" />
                <span className="hint">
                  {warning.moderator} · <RelativeTime at={warning.createdAt} />
                </span>
              </div>
              {warning.revokedAt ? (
                <span className="hint">Revoked</span>
              ) : (
                <button
                  type="button"
                  className="quiet-link"
                  onClick={() =>
                    setRevoking(revoking === warning.id ? null : warning.id)
                  }
                >
                  Revoke
                </button>
              )}
              {revoking === warning.id && (
                <div className="inline-form">
                  <input
                    className="input"
                    value={revokeReason}
                    onChange={(event) => setRevokeReason(event.target.value)}
                    placeholder="Why revoke it?"
                    aria-label="Revoke reason"
                  />
                  <button
                    type="button"
                    className="button ghost small"
                    disabled={busy || !revokeReason.trim()}
                    onClick={() =>
                      void run(`/api/mod/warnings/${warning.id}/revoke`, {
                        reason: revokeReason,
                      })
                    }
                  >
                    Confirm
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="inline-form">
        <select
          className="select"
          value={points}
          onChange={(event) => setPoints(Number(event.target.value))}
          aria-label="Warning points"
        >
          <option value={1}>1 point</option>
          <option value={2}>2 points</option>
          <option value={3}>3 points (auto-mute)</option>
        </select>
        <input
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason for the warning"
          aria-label="Warning reason"
        />
        <button
          type="button"
          className="button danger"
          disabled={busy || !reason.trim()}
          onClick={() =>
            void run(`/api/mod/users/${profile.user.id}/warnings`, {
              points,
              reason,
            })
          }
        >
          Warn
        </button>
      </div>

      <h2>Internal notes</h2>
      {staff.notes.length === 0 ? (
        <p className="hint">No notes yet.</p>
      ) : (
        <ul className="activity-list">
          {staff.notes.map((entry) => (
            <li key={entry.id}>
              <p>{entry.body}</p>
              <span className="hint">
                {entry.author} · <RelativeTime at={entry.createdAt} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="inline-form">
        <input
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Staff-only note"
          aria-label="Staff note"
          maxLength={1000}
        />
        <button
          type="button"
          className="button ghost"
          disabled={busy || !note.trim()}
          onClick={() =>
            void run(`/api/mod/users/${profile.user.id}/notes`, { body: note })
          }
        >
          Add note
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function ProfileEditor({
  profile,
  onSaved,
}: {
  profile: ProfileView
  onSaved: () => void
}) {
  const [displayName, setDisplayName] = useState(profile.user.name)
  const [bio, setBio] = useState(profile.user.bio ?? '')
  const [roleTag, setRoleTag] = useState(profile.user.roleTag ?? '')
  const [avatarColor, setAvatarColor] = useState(profile.user.avatarColor)
  const [avatarMediaId, setAvatarMediaId] = useState(
    profile.user.avatarMediaId,
  )
  const [showSupporterBadge, setShowSupporterBadge] = useState(
    profile.user.showSupporterBadge,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const patch: Record<string, unknown> = {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        roleTag: roleTag || null,
        avatarColor,
        avatarMediaId,
      }
      if (profile.user.staffRole === 'supporter') {
        patch.showSupporterBadge = showSupporterBadge
      }
      await send('/api/me', 'PATCH', patch)
      setSaved(true)
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="composer profile-editor" onSubmit={submit}>
      <h2 className="form-title">Edit profile</h2>
      <div className="avatar-editor">
        <Avatar
          person={{ ...profile.user, avatarMediaId }}
          size={64}
        />
        <div className="avatar-editor-actions">
          <ImagePicker
            label="Upload avatar"
            kind="avatar"
            onUploaded={async (media) => {
              await send('/api/me', 'PATCH', { avatarMediaId: media.id })
              setAvatarMediaId(media.id)
              onSaved()
            }}
          />
          {avatarMediaId && (
            <button
              type="button"
              className="button ghost small"
              onClick={async () => {
                await send('/api/me', 'PATCH', { avatarMediaId: null })
                setAvatarMediaId(null)
                onSaved()
              }}
            >
              Remove avatar
            </button>
          )}
          <span className="hint">JPEG, PNG, or WebP. Cropped and stripped.</span>
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="profile-name">
          Display name
        </label>
        <input
          id="profile-name"
          className="input"
          value={displayName}
          minLength={LIMITS.displayNameMin}
          maxLength={LIMITS.displayNameMax}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="profile-bio">
          Bio
        </label>
        <textarea
          id="profile-bio"
          className="textarea short"
          value={bio}
          maxLength={LIMITS.bioMax}
          onChange={(event) => setBio(event.target.value)}
          placeholder="What you film, and what you are still learning."
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="profile-role">
          Role tag
        </label>
        <select
          id="profile-role"
          className="select"
          value={roleTag}
          onChange={(event) => setRoleTag(event.target.value)}
        >
          <option value="">No tag</option>
          {ROLE_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>
      {profile.user.staffRole === 'supporter' && (
        <label className="hint admin-check">
          <input
            type="checkbox"
            checked={showSupporterBadge}
            onChange={(event) => setShowSupporterBadge(event.target.checked)}
          />
          Show the Supporter badge on my profile and posts
        </label>
      )}
      <fieldset className="field swatch-field">
        <legend className="field-label">Avatar colour</legend>
        <div className="swatches">
          {AVATAR_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="swatch"
              style={{ background: color }}
              aria-label={color}
              aria-pressed={avatarColor === color}
              onClick={() => setAvatarColor(color)}
            />
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="composer-foot">
        <span className="hint">{saved ? 'Saved.' : ''}</span>
        <button className="button" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}
