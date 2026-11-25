export type Session = {
  user: { sub: string; name?: string; email?: string } | null
  viewer: Viewer | null
  mode: 'local' | 'freebuff' | 'setup'
  database: boolean
}

export type StaffRole = 'member' | 'supporter' | 'moderator' | 'admin'

export type Viewer = {
  id: string
  handle: string
  name: string
  staffRole: StaffRole
  roleTag: string | null
  avatarColor: string
  avatarMediaId: string | null
  showSupporterBadge: boolean
  trustLevel: number
  mutedUntil: number | null
  openReports?: number
  unreadNotifications?: number
}

export type LatestPost = {
  threadSlug: string
  threadTitle: string
  authorName: string
  at: number
}

export type SubcategoryView = {
  id: string
  name: string
  description: string
  threadCount: number
  postCount: number
  latest: LatestPost | null
  staffOnly: boolean
}

export type CategoryView = {
  id: string
  name: string
  description: string
  subcategories: SubcategoryView[]
}

export type BoardStats = {
  threads: number
  posts: number
  members: number
}

export type BoardIndex = {
  categories: CategoryView[]
  stats: BoardStats
}

export type Author = {
  id: string
  handle: string
  name: string
  roleTag: string | null
  staffRole: StaffRole
  avatarColor: string
  avatarMediaId: string | null
  showSupporterBadge: boolean
  joinedAt: number
}

export type EmbedProvider =
  | 'youtube'
  | 'rumble'
  | 'vimeo'
  | 'peertube'
  | 'archive'
  | 'x'

export type Embed = {
  provider: EmbedProvider
  id: string
  url: string
  start?: number
}

export type ThreadPost = {
  id: string
  body: string
  html: string
  embeds: Embed[]
  createdAt: number
  author: Author
}

export type ThreadSummary = {
  id: string
  slug: string
  title: string
  prefix: string | null
  isPinned: boolean
  isLocked: boolean
  createdAt: number
  replyCount: number
  tags: string[]
}

export type ThreadDetail = {
  thread: ThreadSummary
  category: { id: string; name: string }
  subcategory: { id: string; name: string; archived: boolean }
  posts: ThreadPost[]
}

export type BoardThread = {
  slug: string
  title: string
  prefix: string | null
  isPinned: boolean
  isLocked: boolean
  lastActivityAt: number
  replyCount: number
  author: { name: string; handle: string; avatarColor: string }
}

export type BoardDetail = {
  board: {
    id: string
    name: string
    description: string
    archived: boolean
    imageMediaId: string | null
  }
  category: { id: string; name: string }
  threads: BoardThread[]
}

export type WarningView = {
  id: string
  points: number
  reason: string
  createdAt: number
  expiresAt: number
  revokedAt: number | null
  moderator: string
}

export type StaffProfile = {
  warnings: WarningView[]
  activePoints: number
  mutedUntil: number | null
  notes: {
    id: string
    body: string
    createdAt: number
    author: string
  }[]
}

export type ProfileView = {
  user: {
    id: string
    handle: string
    name: string
    bio: string | null
    roleTag: string | null
    staffRole: StaffRole
    avatarColor: string
    avatarMediaId: string | null
    showSupporterBadge: boolean
    joinedAt: number
    trustLevel: number
  }
  stats: { threads: number; posts: number }
  recent: {
    id: string
    threadSlug: string
    threadTitle: string
    excerpt: string
    at: number
  }[]
  staff: StaffProfile | null
}

export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed'

export type ReportView = {
  id: string
  status: ReportStatus
  reason: string
  details: string | null
  resolution: string | null
  createdAt: number
  handledAt: number | null
  reporter: { name: string; handle: string }
  author: { id: string; name: string; handle: string; avatarColor: string }
  post: { id: string; excerpt: string; status: string }
  thread: { slug: string; title: string }
  board: { id: string; name: string }
}

export type ModQueue = {
  reports: ReportView[]
  counts: { open: number; inReview: number }
}

export type AdminBoard = {
  id: string
  categoryId: string
  name: string
  description: string
  sortOrder: number
  staffOnly: boolean
  postMinRole: string
  archived: boolean
  threadCount: number
  imageMediaId: string | null
}

export type AdminCategory = {
  id: string
  name: string
  description: string
  sortOrder: number
  boards: AdminBoard[]
}

export type AdminBoards = { categories: AdminCategory[] }

export type ModBoard = {
  id: string
  name: string
  staffOnly: boolean
  imageMediaId: string | null
}

export type AuditEntry = {
  id: string
  action: string
  targetType: string
  targetId: string
  reason: string | null
  metadata: string | null
  createdAt: number
  actor: string
}

export type AuditPage = { entries: AuditEntry[] }

export type MediaKind = 'avatar' | 'board_banner' | 'post_image'

export type MediaView = {
  id: string
  url: string
  kind: MediaKind
  width: number
  height: number
  bytes: number
}

export type NotificationView = {
  id: string
  type: 'reply' | 'mention' | 'warning' | 'report' | 'supporter'
  snippet: string
  createdAt: number
  readAt: number | null
  postId: string | null
  thread: { slug: string; title: string } | null
  actor: { name: string; handle: string; avatarColor: string }
}

export type NotificationPage = {
  notifications: NotificationView[]
  unread: number
}

export type RealtimeTicketResponse = {
  enabled: boolean
  websocketUrl?: string
}

export type DonationKind =
  | 'paypal'
  | 'venmo'
  | 'cashapp'
  | 'zelle'
  | 'kofi'
  | 'buymeacoffee'
  | 'other'

export type DonationSettings = {
  intro: string
  memoNote: string
}

export type DonationMethod = {
  id: string
  kind: DonationKind
  label: string
  destination: string
  url: string | null
  note: string | null
  enabled: boolean
  sortOrder: number
}

export type DonationPage = {
  settings: DonationSettings
  methods: DonationMethod[]
}

export type AdminDonations = DonationPage

export type AdminSupporter = {
  id: string
  handle: string
  name: string
  avatarColor: string
  avatarMediaId: string | null
  showSupporterBadge: boolean
  joinedAt: number
}
