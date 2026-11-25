import { useCallback, useEffect, useState, type ReactNode } from 'react'
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
  loading: boolean
  reload: () => void
}

/** Fetches JSON for a URL, and skips entirely when the URL is null. */
function useJson<T>(url: string | null): Loadable<T> {
  const [state, setState] = useState<Omit<Loadable<T>, 'reload'>>({
    data: null,
    error: '',
    loading: Boolean(url),
  })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: '', loading: false })
      return
    }
    const controller = new AbortController()
    setState({ data: null, error: '', loading: true })
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        const body = (await response.json().catch(() => null)) as
          | (T & { error?: string })
          | null
        if (!response.ok)
          throw new Error(body?.error || 'The page could not be loaded.')
        if (!body) throw new Error('The server returned an unexpected response.')
        setState({ data: body, error: '', loading: false })
      } catch (error) {
        if (controller.signal.aborted) return
        setState({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'The page could not be loaded.',
          loading: false,
        })
      }
    })()
    return () => controller.abort()
  }, [url, nonce])

  return { ...state, reload }
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
  | { name: 'donate' }
  | { name: 'mod' }
  | { name: 'admin' }
  | { name: 'missing' }

function parseRoute(path: string): Route {
  if (path === '/') return { name: 'boards' }
  if (path === '/foia') return { name: 'foia' }
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
  const session = useJson<Session>('/api/session')

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
      <main className="main">{content}</main>
      <footer className="footer">
        <span>PublicLens</span>
        <span aria-hidden="true" className="dot" />
        <span>Document the encounter. Cite the law. Strip the metadata.</span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
