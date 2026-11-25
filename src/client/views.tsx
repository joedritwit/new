import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import { REPORT_REASONS } from '../shared/forum'
import { fullDate, numberFormat } from './ui'
import type {
  BoardIndex,
  Embed,
  Session,
  ThreadDetail,
  ThreadPost,
  Viewer,
} from '../shared/types'
import { send } from './api'
import { Composer } from './composer'
import {
  Avatar,
  EmbedFrame,
  Link,
  Prefix,
  RelativeTime,
  RoleBadge,
  canSeek,
} from './ui'

export function BoardIndexView({ data }: { data: BoardIndex }) {
  return (
    <>
      <section className="page-head">
        <p className="eyebrow">
          <span className="rec-dot" aria-hidden="true" />
          First Amendment audit community
        </p>
        <h1>Boards</h1>
        <p className="lede">
          Field reports, doctrine, gear, and the paperwork that makes a
          recording matter.
        </p>
        <dl className="tally">
          <div>
            <dd>{numberFormat.format(data.stats.threads)}</dd>
            <dt>threads</dt>
          </div>
          <div>
            <dd>{numberFormat.format(data.stats.posts)}</dd>
            <dt>posts</dt>
          </div>
          <div>
            <dd>{numberFormat.format(data.stats.members)}</dd>
            <dt>members</dt>
          </div>
        </dl>
      </section>

      <div className="category-list">
        {data.categories.map((category) => (
          <details className="category" key={category.id} open>
            <summary className="category-head">
              <span className="category-titles">
                <span className="category-name">{category.name}</span>
                <span className="category-desc">{category.description}</span>
              </span>
              <span className="category-count">
                {numberFormat.format(
                  category.subcategories.reduce(
                    (total, subcategory) => total + subcategory.threadCount,
                    0,
                  ),
                )}{' '}
                threads
              </span>
              <span className="chevron" aria-hidden="true">
                <svg viewBox="0 0 12 12" width="12" height="12">
                  <path
                    d="M2.5 4.5 6 8l3.5-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </summary>
            <ul className="board-list">
              {category.subcategories.map((subcategory) => (
                <li className="board-row" key={subcategory.id}>
                  <div className="board-main">
                    <Link
                      className="board-name"
                      href={`/b/${subcategory.id}`}
                    >
                      {subcategory.name}
                    </Link>
                    <span className="board-desc">
                      {subcategory.description}
                    </span>
                  </div>
                  <div className="board-count">
                    <strong>{numberFormat.format(subcategory.threadCount)}</strong>
                    <span>threads</span>
                  </div>
                  <div className="board-count">
                    <strong>{numberFormat.format(subcategory.postCount)}</strong>
                    <span>posts</span>
                  </div>
                  <div className="board-latest">
                    {subcategory.latest ? (
                      <>
                        <Link
                          className="latest-title"
                          href={`/t/${subcategory.latest.threadSlug}`}
                        >
                          {subcategory.latest.threadTitle}
                        </Link>
                        <span className="latest-meta">
                          {subcategory.latest.authorName} ·{' '}
                          <RelativeTime at={subcategory.latest.at} />
                        </span>
                      </>
                    ) : (
                      <span className="latest-meta">No threads yet</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </>
  )
}

function ReportForm({
  postId,
  onDone,
}: {
  postId: string
  onDone: () => void
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await send('/api/reports', 'POST', {
        postId,
        reason,
        details: details.trim() || null,
      })
      setSent(true)
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not report it.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) return <p className="notice-inline">Reported. A moderator will review it.</p>

  return (
    <form className="report-form" onSubmit={submit}>
      <div className="inline-form">
        <select
          className="select"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-label="Report reason"
        >
          {REPORT_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="button danger" disabled={busy}>
          {busy ? 'Sending…' : 'Send report'}
        </button>
      </div>
      <textarea
        className="textarea short"
        value={details}
        maxLength={500}
        onChange={(event) => setDetails(event.target.value)}
        placeholder="Anything a moderator should know"
        aria-label="Report details"
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

export function ThreadView({
  data,
  viewer,
  authMode,
  onPosted,
}: {
  data: ThreadDetail
  viewer: Viewer | null
  authMode: Session['mode']
  onPosted: () => void
}) {
  const { thread, posts, category, subcategory } = data
  const [quote, setQuote] = useState<{ id: string; text: string } | null>(null)
  const [reporting, setReporting] = useState<string | null>(null)
  const [seek, setSeek] = useState<{ key: string; start: number } | null>(null)

  const firstVideo = posts
    .flatMap((post) => post.embeds)
    .find(canSeek)
  const firstKey = firstVideo ? `${firstVideo.provider}:${firstVideo.id}` : ''

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('t')
    const start = Number(raw)
    if (!firstKey || !Number.isFinite(start) || start < 0) return
    setSeek({ key: firstKey, start: Math.floor(start) })
  }, [firstKey])

  useEffect(() => {
    if (!window.location.hash.startsWith('#post-')) return
    const target = document.getElementById(window.location.hash.slice(1))
    target?.scrollIntoView({ block: 'center' })
  }, [posts.length])

  function seekFromPost(
    event: MouseEvent<HTMLDivElement>,
    post: ThreadPost,
  ) {
    const anchor = (event.target as HTMLElement).closest('a.timestamp')
    if (!(anchor instanceof HTMLAnchorElement)) return
    const start = Number(anchor.dataset.seconds)
    if (!Number.isFinite(start)) return
    const video: Embed | undefined = post.embeds.find(canSeek) ?? firstVideo
    if (!video) return
    event.preventDefault()
    setSeek({ key: `${video.provider}:${video.id}`, start: Math.floor(start) })
  }

  const quotePrefix = quote
    ? `> ${quote.text.split('\n').join('\n> ')}\n\n`
    : ''

  return (
    <article className="thread">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Boards</Link>
        <span className="crumb-sep" aria-hidden="true">
          /
        </span>
        <Link href={`/b/${subcategory.id}`}>{category.name}</Link>
        <span className="crumb-sep" aria-hidden="true">
          /
        </span>
        <Link href={`/b/${subcategory.id}`}>{subcategory.name}</Link>
      </nav>

      <header className="thread-head">
        <div className="thread-labels">
          {thread.prefix && <Prefix value={thread.prefix} />}
          {thread.isPinned && <span className="label">Pinned</span>}
          {thread.isLocked && <span className="label">Locked</span>}
        </div>
        <h1>{thread.title}</h1>
        <p className="thread-meta">
          <span>
            {numberFormat.format(thread.replyCount + 1)}{' '}
            {thread.replyCount === 0 ? 'post' : 'posts'}
          </span>
          <span aria-hidden="true" className="dot" />
          <span>
            started <RelativeTime at={thread.createdAt} />
          </span>
          {thread.tags.length > 0 && (
            <>
              <span aria-hidden="true" className="dot" />
              <span className="thread-tags">
                {thread.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </span>
            </>
          )}
        </p>
      </header>

      <ol className="posts">
        {posts.map((post, index) => (
          <li
            className={`post${index === 0 ? ' op' : ''}`}
            key={post.id}
            id={`post-${post.id}`}
          >
            <div className="post-rail">
              <Avatar person={post.author} size={38} />
              <div className="post-identity">
                <Link
                  className="post-author"
                  href={`/u/${post.author.handle}`}
                >
                  {post.author.name}
                </Link>
                <span className="post-sub">
                  {post.author.roleTag ?? 'Member'}
                </span>
              </div>
            </div>
            <div className="post-content">
              <div className="post-meta">
                {index === 0 && <span className="op-badge">OP</span>}
                <RoleBadge
                  role={post.author.staffRole}
                  showSupporterBadge={post.author.showSupporterBadge}
                />
                <time dateTime={new Date(post.createdAt).toISOString()}>
                  {fullDate(post.createdAt)}
                </time>
                {viewer && !thread.isLocked && (
                  <button
                    type="button"
                    className="quiet-link"
                    onClick={() =>
                      setQuote({
                        id: post.id,
                        text: post.body.slice(0, 400),
                      })
                    }
                  >
                    Quote
                  </button>
                )}
                {viewer && viewer.id !== post.author.id && (
                  <button
                    type="button"
                    className="quiet-link"
                    onClick={() =>
                      setReporting(reporting === post.id ? null : post.id)
                    }
                  >
                    {reporting === post.id ? 'Cancel report' : 'Report'}
                  </button>
                )}
              </div>
              {post.embeds.map((embed) => {
                const key = `${embed.provider}:${embed.id}`
                return (
                  <EmbedFrame
                    key={key}
                    embed={embed}
                    start={seek?.key === key ? seek.start : embed.start}
                  />
                )
              })}
              <div
                className="post-text"
                onClick={(event) => seekFromPost(event, post)}
                dangerouslySetInnerHTML={{ __html: post.html }}
              />
              {reporting === post.id && (
                <ReportForm postId={post.id} onDone={() => setReporting(null)} />
              )}
            </div>
          </li>
        ))}
      </ol>

      <footer className="thread-reply">
        {!viewer ? (
          <p className="signin-note">
            {authMode === 'freebuff' ? (
              <a href="/auth/freebuff/signin?returnTo=%2F">Sign in</a>
            ) : (
              'Sign-in is not configured for this build.'
            )}{' '}
            {authMode === 'freebuff' && 'to reply to this thread.'}
          </p>
        ) : thread.isLocked ? (
          <p className="signin-note">
            This thread is locked. Moderators can reopen it.
          </p>
        ) : subcategory.archived ? (
          <p className="signin-note">
            This board is archived. Existing threads stay readable, but nothing
            new can be posted.
          </p>
        ) : (
          <>
            {quote && (
              <p className="quote-note">
                Quoting a post above.{' '}
                <button
                  type="button"
                  className="quiet-link"
                  onClick={() => setQuote(null)}
                >
                  Clear
                </button>
              </p>
            )}
            <Composer
              key={quote?.id ?? 'reply'}
              initialValue={quotePrefix}
              placeholder="Add to the thread. Cite the statute, timestamp the clip, keep addresses out."
              submitLabel="Post reply"
              hint={
                viewer.trustLevel === 0
                  ? 'New accounts cannot post links yet. Three posts and 24 hours unlock them.'
                  : undefined
              }
              onSubmit={async (body) => {
                await send(`/api/threads/${encodeURIComponent(thread.slug)}/posts`, 'POST', {
                  body,
                })
                setQuote(null)
                onPosted()
              }}
            />
          </>
        )}
      </footer>
    </article>
  )
}

