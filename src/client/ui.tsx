import type { CSSProperties, ReactNode } from 'react'
import { TRUST_LABELS } from '../shared/forum'
import type { Embed, StaffRole } from '../shared/types'
import { navigate } from './api'

export const numberFormat = new Intl.NumberFormat()

export function Link({
  href,
  className,
  children,
  ariaLabel,
}: {
  href: string
  className?: string
  children: ReactNode
  ariaLabel?: string
}) {
  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return
        event.preventDefault()
        navigate(href)
      }}
    >
      {children}
    </a>
  )
}

function relativeTime(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function fullDate(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function RelativeTime({ at }: { at: number }) {
  return (
    <time dateTime={new Date(at).toISOString()} title={fullDate(at)}>
      {relativeTime(at)}
    </time>
  )
}

const PREFIX_TONES: Record<string, string> = {
  NOTICE: 'red',
  AUDIT: 'blue',
  'POST OFFICE': 'amber',
  'POLICE ENCOUNTER': 'red',
  CA: 'blue',
  'FOIA WIN': 'green',
  'CASE LAW': 'violet',
  GEAR: 'slate',
  LIVE: 'red',
  OPSEC: 'violet',
  INTRO: 'slate',
  DISCUSSION: 'slate',
}

export function Prefix({ value }: { value: string }) {
  return (
    <span className="prefix" data-tone={PREFIX_TONES[value] ?? 'slate'}>
      {value}
    </span>
  )
}

const ROLE_LABELS: Record<StaffRole, string> = {
  member: '',
  supporter: 'Supporter',
  moderator: 'Moderator',
  admin: 'Admin',
}

export function RoleBadge({
  role,
  showSupporterBadge = true,
}: {
  role: StaffRole
  showSupporterBadge?: boolean
}) {
  const label = ROLE_LABELS[role]
  if (!label || (role === 'supporter' && !showSupporterBadge)) return null
  return (
    <span className="role-badge" data-role={role}>
      {label}
    </span>
  )
}

export function TrustLabel({ level }: { level: number }) {
  return (
    <span className="trust" data-level={level}>
      {TRUST_LABELS[level] ?? 'New member'}
    </span>
  )
}

export function Avatar({
  person,
  size = 34,
}: {
  person: { name: string; avatarColor: string; avatarMediaId?: string | null }
  size?: number
}) {
  if (person.avatarMediaId) {
    return (
      <img
        className="avatar avatar-image"
        src={`/api/files/${person.avatarMediaId}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ '--avatar-size': `${size}px` } as CSSProperties}
      />
    )
  }

  const initials = person.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
  return (
    <span
      className="avatar"
      style={
        {
          '--avatar-color': person.avatarColor,
          '--avatar-size': `${size}px`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

const SEEKABLE = new Set(['youtube', 'vimeo', 'peertube', 'archive'])

export function canSeek(embed: Embed): boolean {
  return SEEKABLE.has(embed.provider)
}

function embedSource(embed: Embed, start?: number): string {
  const at = start && start > 0 ? Math.floor(start) : undefined
  if (embed.provider === 'youtube') {
    const query = [at ? `start=${at}` : '', at ? 'autoplay=1' : ''].filter(Boolean)
    return `https://www.youtube-nocookie.com/embed/${embed.id}${query.length ? `?${query.join('&')}` : ''}`
  }
  if (embed.provider === 'vimeo') {
    const query = ['dnt=1', at ? 'autoplay=1' : ''].filter(Boolean)
    return `https://player.vimeo.com/video/${embed.id}?${query.join('&')}${at ? `#t=${at}` : ''}`
  }
  if (embed.provider === 'peertube') {
    const [host, uuid] = embed.id.split('/')
    if (host && uuid) {
      const query = [at ? `startTime=${at}` : '', at ? 'autoplay=1' : ''].filter(Boolean)
      return `https://${host}/videos/embed/${uuid}${query.length ? `?${query.join('&')}` : ''}`
    }
  }
  if (embed.provider === 'archive') {
    return `https://archive.org/embed/${embed.id}${at ? `?start=${at}&autoplay=1` : ''}`
  }
  return `https://rumble.com/embed/${embed.id}/`
}

const EMBED_TITLES: Record<string, string> = {
  youtube: 'YouTube video',
  rumble: 'Rumble video',
  vimeo: 'Vimeo video',
  peertube: 'PeerTube video',
  archive: 'Internet Archive video',
}

export function EmbedFrame({ embed, start }: { embed: Embed; start?: number }) {
  if (embed.provider === 'x') {
    return (
      <a
        className="embed-link"
        href={embed.url}
        target="_blank"
        rel="nofollow ugc noopener"
      >
        View this post on X
        <span aria-hidden="true"> ↗</span>
      </a>
    )
  }

  return (
    <div className="embed">
      <iframe
        src={embedSource(embed, start)}
        title={EMBED_TITLES[embed.provider] ?? 'Embedded video'}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="bar" />
      <span className="bar short" />
      <span className="bar" />
      <span className="bar short" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

export function Failure({ message }: { message: string }) {
  return (
    <div className="failure" role="alert">
      <h2>That did not load</h2>
      <p>{message}</p>
      <button className="button" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  )
}
