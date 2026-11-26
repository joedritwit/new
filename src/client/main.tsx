import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type {
  AdminBoards,
  AdminDonations,
  AdminSupporter,
  AuditPage,
  BoardDetail,
  BoardIndex,
  DonationPage,
  ModBoard,
  ModQueue,
  ProfileView,
  Session,
  ThreadDetail,
} from '../shared/types'
import { AdminPage } from './admin'
import { DonatePage } from './donate'
import { FoiaPage } from './foia'
import { DmcaPage, TermsPage } from './legal'
import { ModQueuePage } from './mod'
import { BoardIndexView, ThreadView } from './views'
import { BoardView, NewThreadView, ProfilePage } from './pages'
import { NotificationBell } from './notifications'
import { Avatar, Failure, Link, Loading } from './ui'
import './style.css'

function usePathname(): string {
  const [path, setPath] = useState(() => currentPath())
  useEffect(() => {
    const update = () => setPath(currentPath())
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  return path
}

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

type Loadable<T> = {
  data: T | null
  error: string
  code: string
  loading: boolean
  reload: () => void
}

/**
 * Fetches JSON for a URL, and skips entirely when the URL is null. A Turnstile
 * token is only passed for the session call that creates the account.
 */
function useJson<T>(url: string | null, turnstileToken = ''): Loadable<T> {
  const [state, setState] = useState<Omit<Loadable<T>, 'reload'>>({
    data: null,
    error: '',
    code: '',
    loading: Boolean(url),
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: '', code: '', loading: false })
      return
    }
    const controller = new AbortController()
    setState({ data: null, error: '', code: '', loading: true })
    void (async () => {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: turnstileToken
            ? { 'X-Turnstile-Token': turnstileToken }
            : undefined,
        })
        const body = (await response.json().catch(() => null)) as
          | (T & { error?: string; code?: string })
          | null
        if (!response.ok) {
          if (controller.signal.aborted) return
          setState({
            data: null,
            error: body?.error || 'The page could not be loaded.',
            code: body?.code ?? '',
            loading: false,
          })
          return
        }
        if (!body) throw new Error('The server returned an unexpected response.')
        setState({ data: body, error: '', code: '', loading: false })
      } catch (error) {
        if (controller.signal.aborted) return
        setState({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'The page could not be loaded.',
          code: '',
          loading: false,
        })
      }
    })()
    return () => controller.abort()
  }, [url, nonce, turnstileToken])

  return { ...state, reload }
}

const TURNSTILE_SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/**
 * Shown only when the server asks for a verification token while creating the
 * account. Tokens are single-use, so a failed check remounts the widget.
 */
function TurnstileGate({
  siteKey,
  failed,
  onToken,
}: {
  siteKey: string
  failed: boolean
  onToken: (token: string) => void
}) {
  const holder = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    let widgetId = ''
    const render = () => {
      if (cancelled || !holder.current || !window.turnstile) return
      widgetId = window.turnstile.render(holder.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
      })
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile]',
    )
    if (window.turnstile) {
      render()
    } else if (existing) {
      existing.addEventListener('load', render)
    } else {
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT
      script.async = true
      script.dataset.turnstile = 'true'
      script.addEventListener('load', render)
      document.head.appendChild(script)
    }
    return () => {
      cancelled = true
      existing?.removeEventListener('load', render)
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [siteKey, onToken, failed])

  return (
    <section className="panel turnstile-gate" aria-live="polite">
      <h2>One quick check</h2>
      <p>
        PublicLens uses Cloudflare Turnstile to keep automated sign-ups out.
        Finish the check to create your account.
      </p>
      {failed && (
        <p className="signin-note">
          That check did not pass. Complete it again to continue.
        </p>
      )}
      {siteKey ? (
        <div ref={holder} />
      ) : (
        <p className="signin-note">
          Verification is not configured for this build. Contact the site
          owner.
        </p>
      )}
    </section>
  )
}

function Header({ session }: { session: Loadable<Session> }) {
  const viewer = session.data?.viewer
  const mode = session.data?.mode
  const moderator =
    viewer?.staffRole === 'moderator' || viewer?.staffRole === 'admin'

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" ariaLabel="PublicLens home">
          <span className="mark" aria-hidden="true">
            <span className="rec" />
          </span>
          <span className="brand-name">
            Public<span>Lens</span>
          </span>
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/" className="nav-link">
            Boards
          </Link>
          <Link href="/foia" className="nav-link">
            FOIA
          </Link>
          <Link href="/donate" className="nav-link">
            Donate
          </Link>
          {moderator && (
            <Link href="/mod" className="nav-link">
              Mod queue
              {viewer.openReports ? ` (${viewer.openReports})` : ''}
            </Link>
          )}
          {viewer?.staffRole === 'admin' && (
            <Link href="/admin" className="nav-link">
              Admin
            </Link>
          )}
        </nav>
        <div className="account">
          {viewer ? (
            <>
              <NotificationBell viewer={viewer} />
              <Link href={`/u/${viewer.handle}`} className="account-chip">
                <Avatar person={viewer} size={26} />
                <span className="account-name">{viewer.name}</span>
              </Link>
              {mode === 'freebuff' && (
                <form method="post" action="/auth/freebuff/signout">
                  <button className="button ghost small" type="submit">
                    Sign out
                  </button>
                </form>
              )}
            </>
          ) : mode === 'freebuff' ? (
            <a className="button small" href="/auth/freebuff/signin?returnTo=%2F">
              Sign in
            </a>
          ) : null}
        </div>
      </div>
    </header>
  )
}

type Route =
  | { name: 'boards' }
  | { name: 'board'; boardId: string }
  | { name: 'new-thread'; boardId: string }
  | { name: 'thread'; slug: string }
  | { name: 'profile'; handle: string }
  | { name: 'foia' }
  | { name: 'terms' }
  | { name: 'dmca' }
  | { name: 'donate' }
  | { name: 'mod' }
  | { name: 'admin' }
  | { name: 'missing' }

function parseRoute(path: string): Route {
  if (path === '/') return { name: 'boards' }
  if (path === '/foia') return { name: 'foia' }
  if (path === '/terms') return { name: 'terms' }
  if (path === '/dmca') return { name: 'dmca' }
  if (path === '/donate') return { name: 'donate' }
  if (path === '/mod') return { name: 'mod' }
  if (path === '/admin') return { name: 'admin' }

  let match = /^\/b\/([^/]+)\/new$/.exec(path)
  if (match) return { name: 'new-thread', boardId: decodeURIComponent(match[1]!) }

  match = /^\/b\/([^/]+)$/.exec(path)
  if (match) return { name: 'board', boardId: decodeURIComponent(match[1]!) }

  match = /^\/t\/([^/]+)$/.exec(path)
  if (match) return { name: 'thread', slug: decodeURIComponent(match[1]!) }

  match = /^\/u\/([^/]+)$/.exec(path)
  if (match) return { name: 'profile', handle: decodeURIComponent(match[1]!) }

  return { name: 'missing' }
}

function App() {
  const path = usePathname()
  const route = parseRoute(path)
  const [turnstileToken, setTurnstileToken] = useState('')
  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token)
  }, [])
  const session = useJson<Session>('/api/session', turnstileToken)

  const boards = useJson<BoardIndex>(
    route.name === 'boards' ? '/api/boards' : null,
  )
  const board = useJson<BoardDetail>(
    route.name === 'board' || route.name === 'new-thread'
      ? `/api/boards/${encodeURIComponent(route.boardId)}`
      : null,
  )
  const thread = useJson<ThreadDetail>(
    route.name === 'thread'
      ? `/api/threads/${encodeURIComponent(route.slug)}`
      : null,
  )
  const profile = useJson<ProfileView>(
    route.name === 'profile'
      ? `/api/users/${encodeURIComponent(route.handle)}`
      : null,
  )
  const donations = useJson<DonationPage>(
    route.name === 'donate' ? '/api/donations' : null,
  )
  const mod = useJson<ModQueue>(
    route.name === 'mod' ? '/api/mod/reports' : null,
  )
  const modBoards = useJson<{ boards: ModBoard[] }>(
    route.name === 'mod' ? '/api/mod/boards' : null,
  )
  const adminBoards = useJson<AdminBoards>(
    route.name === 'admin' ? '/api/admin/boards' : null,
  )
  const audit = useJson<AuditPage>(
    route.name === 'admin' ? '/api/admin/audit' : null,
  )
  const adminDonations = useJson<AdminDonations>(
    route.name === 'admin' ? '/api/admin/donations' : null,
  )
  const adminSupporters = useJson<{ supporters: AdminSupporter[] }>(
    route.name === 'admin' ? '/api/admin/supporters' : null,
  )

  const viewer = session.data?.viewer ?? null
  const authMode = session.data?.mode ?? 'setup'

  let content: ReactNode
  if (route.name === 'missing') {
    content = <Failure message="That page does not exist. The boards are one click away." />
  } else if (route.name === 'boards') {
    content = boards.loading ? (
      <Loading />
    ) : boards.error ? (
      <Failure message={boards.error} />
    ) : boards.data ? (
      <BoardIndexView data={boards.data} />
    ) : null
  } else if (route.name === 'board') {
    content = board.loading ? (
      <Loading />
    ) : board.error ? (
      <Failure message={board.error} />
    ) : board.data ? (
      <BoardView data={board.data} viewer={viewer} />
    ) : null
  } else if (route.name === 'new-thread') {
    content = board.loading ? (
      <Loading />
    ) : board.error ? (
      <Failure message={board.error} />
    ) : board.data ? (
      <NewThreadView data={board.data} viewer={viewer} authMode={authMode} />
    ) : null
  } else if (route.name === 'thread') {
    content = thread.loading ? (
      <Loading />
    ) : thread.error ? (
      <Failure message={thread.error} />
    ) : thread.data ? (
      <ThreadView
        data={thread.data}
        viewer={viewer}
        authMode={authMode}
        onPosted={thread.reload}
      />
    ) : null
  } else if (route.name === 'foia') {
    content = <FoiaPage />
  } else if (route.name === 'terms') {
    content = <TermsPage />
  } else if (route.name === 'dmca') {
    content = <DmcaPage />
  } else if (route.name === 'donate') {
    content = donations.loading ? (
      <Loading />
    ) : donations.error ? (
      <Failure message={donations.error} />
    ) : donations.data ? (
      <DonatePage data={donations.data} viewer={viewer} />
    ) : null
  } else if (route.name === 'profile') {
    content = profile.loading ? (
      <Loading />
    ) : profile.error ? (
      <Failure message={profile.error} />
    ) : profile.data ? (
      <ProfilePage
        data={profile.data}
        viewer={viewer}
        onSaved={() => {
          profile.reload()
          session.reload()
        }}
      />
    ) : null
  } else if (route.name === 'mod') {
    content =
      mod.loading || modBoards.loading ? (
        <Loading />
      ) : mod.error || modBoards.error ? (
        <Failure message={mod.error || modBoards.error} />
      ) : mod.data && modBoards.data ? (
        <ModQueuePage
          data={mod.data}
          boards={modBoards.data.boards}
          onChanged={() => {
            mod.reload()
            session.reload()
          }}
          onBoardsChanged={modBoards.reload}
        />
      ) : null
  } else {
    content =
      adminBoards.loading || audit.loading || adminDonations.loading || adminSupporters.loading ? (
        <Loading />
      ) : adminBoards.error || audit.error || adminDonations.error || adminSupporters.error ? (
        <Failure
          message={
            adminBoards.error ||
            audit.error ||
            adminDonations.error ||
            adminSupporters.error
          }
        />
      ) : adminBoards.data && audit.data && adminDonations.data && adminSupporters.data ? (
        <AdminPage
          data={adminBoards.data}
          donations={adminDonations.data}
          supporters={adminSupporters.data.supporters}
          entries={audit.data.entries}
          onChanged={() => {
            adminBoards.reload()
            audit.reload()
            adminDonations.reload()
            adminSupporters.reload()
          }}
        />
      ) : null
  }

  return (
    <div className="shell">
      <Header session={session} />
      <main className="main">
        {session.code.startsWith('turnstile_') && (
          <TurnstileGate
            siteKey={String(
              import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '',
            )}
            failed={session.code === 'turnstile_failed'}
            onToken={handleTurnstileToken}
          />
        )}
        {content}
      </main>
      <footer className="footer">
        <span>PublicLens</span>
        <span aria-hidden="true" className="dot" />
        <span>Document the encounter. Cite the law. Strip the metadata.</span>
        <span aria-hidden="true" className="dot" />
        <nav className="footer-links" aria-label="Legal">
          <Link href="/terms">Terms</Link>
          <Link href="/dmca">DMCA</Link>
        </nav>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
