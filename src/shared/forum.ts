/** Values shared by the Worker (validation) and the browser (form inputs). */

export const THREAD_PREFIXES = [
  'AUDIT',
  'POST OFFICE',
  'POLICE ENCOUNTER',
  'FOIA WIN',
  'CASE LAW',
  'CA',
  'GEAR',
  'LIVE',
  'OPSEC',
  'DISCUSSION',
  'NOTICE',
  'INTRO',
] as const

export type ThreadPrefix = (typeof THREAD_PREFIXES)[number]

export const ROLE_TAGS = [
  'Auditor',
  'Viewer',
  'Legal enthusiast',
  'Gear head',
] as const

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const AVATAR_COLORS = [
  '#E53935',
  '#3B82F6',
  '#C08A4A',
  '#6BA292',
  '#8B7BB8',
  '#7D8794',
] as const

export const LIMITS = {
  titleMin: 4,
  titleMax: 120,
  bodyMax: 10_000,
  bodyHtmlMax: 200_000,
  displayNameMin: 2,
  displayNameMax: 40,
  bioMax: 280,
} as const

export const TRUST_LABELS = ['New member', 'Member', 'Trusted'] as const

export const REPORT_REASONS = [
  { value: 'doxxing', label: 'Private information / doxxing' },
  { value: 'harassment', label: 'Harassment or threats' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'off_topic', label: 'Off topic' },
  { value: 'other', label: 'Something else' },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]['value']

export const REPORT_LIMITS = {
  detailsMax: 500,
  noteMax: 500,
  modNoteMax: 1_000,
} as const

/** Who may start threads and reply in a board. */
export const POST_MIN_ROLES = ['member', 'supporter', 'staff'] as const
export type PostMinRole = (typeof POST_MIN_ROLES)[number]

export const MEDIA_LIMITS = {
  imageBytes: 2_000_000,
  avatarBytes: 512_000,
  uploadBytes: 3_000_000,
  maxDimension: 1_600,
  avatarDimension: 256,
  uploadsPerHour: 20,
  uploadsPerDay: 100,
  siteSoftBytes: 750_000_000,
} as const

export const PEERTUBE_HOSTS = [
  'framatube.org',
  'tilvids.com',
  'video.blender.org',
  'peertube.wtf',
] as const
