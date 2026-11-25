import { useCallback, useEffect, useRef, useState } from 'react'
import type { NotificationPage, NotificationView, Viewer } from '../shared/types'
import { navigate, send } from './api'
import { connectRealtime, type RealtimeConnection } from './realtime'
import { Avatar, RelativeTime } from './ui'

const TYPE_LABEL: Record<NotificationView['type'], string> = {
  reply: 'replied to your thread',
  mention: 'mentioned you',
  warning: 'issued a warning',
  report: 'updated your report',
  supporter: 'updated your supporter status',
}

export function NotificationBell({ viewer }: { viewer: Viewer }) {
  const [data, setData] = useState<NotificationPage | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' })
      if (!response.ok) return
      setData((await response.json()) as NotificationPage)
      setError('')
    } catch {
      setError('Could not load notifications.')
    }
  }, [])

  useEffect(() => {
    void load()
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  useEffect(() => {
    let connection: RealtimeConnection | undefined
    let cancelled = false
    void (async () => {
      const response = await fetch('/api/realtime/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: `user:${viewer.id}` }),
      }).catch(() => null)
      if (!response?.ok || cancelled) return
      const ticket = (await response.json().catch(() => null)) as
        | { enabled?: boolean; websocketUrl?: string }
        | null
      if (!ticket?.enabled || !ticket.websocketUrl || cancelled) return
      connection = connectRealtime({
        room: `user:${viewer.id}`,
        onMessage(message) {
          if (message.type === 'broadcast' && message.event === 'notification')
            void load()
        },
      })
    })()
    return () => {
      cancelled = true
      connection?.close()
    }
  }, [viewer.id, load])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const unread = data?.unread ?? viewer.unreadNotifications ?? 0

  async function openPanel() {
    setOpen((value) => !value)
    if (!open) await load()
  }

  async function markAll() {
    try {
      const result = await send<{ unread: number }>(
        '/api/notifications/read',
        'POST',
        {},
      )
      setData((current) =>
        current
          ? {
              unread: result.unread,
              notifications: current.notifications.map((item) => ({
                ...item,
                readAt: item.readAt ?? Date.now(),
              })),
            }
          : current,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not mark read.')
    }
  }

  async function visit(item: NotificationView) {
    setOpen(false)
    if (!item.readAt) {
      try {
        await send('/api/notifications/read', 'POST', { ids: [item.id] })
        setData((current) =>
          current
            ? {
                unread: Math.max(0, current.unread - 1),
                notifications: current.notifications.map((entry) =>
                  entry.id === item.id
                    ? { ...entry, readAt: Date.now() }
                    : entry,
                ),
              }
            : current,
        )
      } catch {
        // navigation should still work if marking read fails
      }
    }
    if (item.thread) {
      navigate(
        `/t/${item.thread.slug}${item.postId ? `#post-${item.postId}` : ''}`,
      )
    }
  }

  return (
    <div className="notifications" ref={root}>
      <button
        type="button"
        className="bell-button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => void openPanel()}
      >
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
          <path
            d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5v3.2L4 13h12l-1.5-2.8V7A4.5 4.5 0 0 0 10 2.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M8.2 15.2a1.9 1.9 0 0 0 3.6 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-head">
            <strong>Notifications</strong>
            <button
              type="button"
              className="quiet-link"
              onClick={() => void markAll()}
              disabled={!unread}
            >
              Mark all read
            </button>
          </div>
          {error && (
            <p className="form-error inline" role="alert">
              {error}
            </p>
          )}
          {!data?.notifications.length ? (
            <p className="empty-state small">Nothing yet.</p>
          ) : (
            <ul className="notification-list">
              {data.notifications.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notification-item${item.readAt ? '' : ' unread'}`}
                    onClick={() => void visit(item)}
                  >
                    <Avatar
                      person={{
                        name: item.actor.name,
                        avatarColor: item.actor.avatarColor,
                      }}
                      size={24}
                    />
                    <span className="notification-copy">
                      <span>
                        <strong>{item.actor.name}</strong>{' '}
                        {TYPE_LABEL[item.type]}
                      </span>
                      {item.thread && (
                        <span className="notification-thread">
                          {item.thread.title}
                        </span>
                      )}
                      <span className="notification-snippet">{item.snippet}</span>
                    </span>
                    <RelativeTime at={item.createdAt} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
