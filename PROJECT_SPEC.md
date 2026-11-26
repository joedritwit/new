# PublicLens — Project Spec

A grey/charcoal First Amendment audit forum for auditors and viewers: field
reports, doctrine, FOIA resources, gear advice, and civil discussion.

Hosted on **Freebuff Sites** (Cloudflare Workers). This file is the source of
truth for stack decisions, vocabulary, and scope. Reference it in every build
prompt.

---

## 1. Stack (and the constraints behind it)

Sites runs Workers: no Node/Bun server, no PHP or Python, no PostgreSQL, no
long-lived processes.

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React 19 + Vite 8 | The Freebuff web-app starter's shape |
| Rich text | TipTap 3 + DOMPurify + `rehype-sanitize` | Live WYSIWYG editing; canonical HTML stored with derived plain text |
| API | Hono on the same Worker | One deployable, no separate service |
| DB | D1 (SQLite) + Drizzle ORM | Only database Sites offers; Drizzle gives typed queries |
| Auth | `@freebuff/auth` | No password material to store or reset |
| Files | R2 binding `FILES` | Avatars, board banners, and small post images; video stays embedded |
| Realtime | Sites managed realtime | Notification bell without a second backend |
| Payments | Owner-managed PayPal/Venmo/etc. links | No processor integration or secrets; the owner confirms payments and grants Supporter manually |

Deliberate deviations from the original roadmap: **no PostgreSQL/Prisma**, **no
bcrypt/Argon2 native hashing** (no native modules in Workers), **no `sharp`**
(EXIF stripping will be a pure-JS buffer pass), and **no cron** (Supporter
grants never expire; the owner revokes them manually; D1 Time Travel covers
restore).

Deploy: `sites_prepare_next` is not used here — this is a Workers + static-assets
project deployed with `deploy.json` and `sites_deploy`.

---

## 2. Palette

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#121316` | Page background |
| `--panel` | `#1C1E22` | Cards, posts |
| `--panel-raised` | `#24272D` | Category headers, hover, chips |
| `--line` | `#2F333B` | Borders and dividers |
| `--text` | `#E6E8EC` | Primary text |
| `--muted` | `#9AA0AA` | Metadata |
| `--accent` | `#E53935` | REC red: primary buttons, OP badges, staff |
| `--accent-2` | `#3B82F6` | Slate blue: links, focus rings, moderator |

Dark only. No external fonts; system UI stack plus a monospace for counts and
prefixes. Motion is limited to a REC pulse and a loading shimmer, both disabled
under `prefers-reduced-motion`.

---

## 3. Roles and permissions

Server-side only. A role claim in the browser is never trusted.

| Role | Capabilities |
| --- | --- |
| `guest` | Read published boards and threads |
| `member` | Post, reply, react, report, bookmark |
| `supporter` | Member + cosmetics + Supporters Lounge |
| `moderator` | Member + report queue, warnings, soft delete, lock/move, mod notes |
| `admin` | Moderator + board manager, staff roles, supporter grants, audit log |

**Trust levels** (Discourse-style, derived, never client-supplied):

- Level 0 — new account: no external links, max 3 posts/hour.
- Level 1 — 24 h since join **and** 3 published posts: links allowed, 20/hour.
- Level 2 — 7 days and 25 published posts: 60/hour.

`staff_role` lives on `users`; `trust_level` is derived from account age and
published post count (`src/worker/trust.ts`) so it cannot be forged by editing a
row. “Approved” means published; M2 adds reports, warnings, and an append-only
audit log on top of that. The deployment owner’s account is promoted to admin by
a one-time bootstrap in `ensureDatabase`, keyed to its auth subject; there is no
role editor yet.

---

## 4. Data model

Shipped in M0 (see `src/worker/schema.ts` and `migrations.ts`):

- `users` — `id` = auth `sub`, display name, public `handle`, bio, staff role,
  profile role tag, avatar colour, join date. Rows are provisioned lazily on
  first sign-in; `handle` is generated from the name and kept unique.
- `categories` / `subcategories` — board tree with sort order and
  `staff_only` for the Supporters Lounge.
- `threads` — slug, title, prefix, pinned/locked, status
  (`published` / `held` / `removed`), timestamps.
- `posts` — derived plain-text `body`, nullable canonical `body_html`
  (sanitised TipTap HTML), position, status, created/edited timestamps. Legacy
  rows have `body_html = NULL` and render through the Markdown path.
- `tags` / `thread_tags` — topic tags, separate from the thread prefix.
- `schema_meta` — applied migration versions.
- `app_meta` — seed marker.

Shipped in M2:

- `reports` — reporter, post, reason, details, status (`open` / `in_review` /
  `resolved` / `dismissed`), resolution, handler. One report per member per
  post, and members cannot report their own posts.
- `warnings` — 1–3 points, reason, issuing moderator, optional revoke. Active
  points live for 90 days; three active points set `users.muted_until` 24 h out.
- `mod_notes` — staff-only notes attached to an account.
- `audit_log` — append-only record of every staff action (actor, action,
  target, reason, time). No UPDATE or DELETE route exists.
- New columns: `users.muted_until`, `subcategories.post_min_role`
  (`member` / `supporter` / `staff`), `subcategories.archived_at`.

Shipped in M3:

- `media` — R2 object metadata (owner, kind, bytes, dimensions, SHA-256,
  removed state). Originals are never kept; every image is rewritten by the
  pure-JS metadata stripper.
- `users.avatar_media_id`, `subcategories.image_media_id` — uploaded avatar and
  staff-managed board banner.
- `notifications` — reply, mention, warning, report, and supporter updates,
  read/unread and a per-user realtime room.
- Image limits: 2 MB post image, 512 KB avatar, 1600 px longest edge, JPEG/PNG/
  WebP only, 20 uploads/hour, 750 MB soft site cap.

Shipped in M4:

- `donation_settings` — owner-editable donation intro and payment-memo note.
- `donation_methods` — public PayPal/Venmo/Cash App/Zelle/Ko-fi/Buy Me a Coffee/
  other handles or links, with enable/disable and ordering.
- `users.show_supporter_badge` — lets a Supporter hide the badge without losing
  Supporter access.
- Supporter grants are manual admin actions stored in `audit_log`; there is no
  payment processor, webhook, payment ledger, or automatic expiry.

New posts store derived plain text in `body` and canonical sanitised TipTap
HTML in nullable `body_html`; legacy rows keep `body_html = NULL`. The browser
and Worker each apply an allowlist. Editor colours, sizes, and alignment become
`.tx-*`, `.fs-*`, and `.align-*` classes, never stored CSS. Poll/Embed inserts an
external URL; native in-app polls are out of scope for this milestone.

Planned, in milestone order: `reactions`, `bookmarks`, `subscriptions`,
`user_cosmetics`.

Invariants:

- Counters shown on the index are derived from `posts`/`threads` with
  `status = 'published'`; there is no denormalised counter to drift.
- `moderation_actions` and `audit_log` are append-only: no UPDATE or DELETE
  route exists for either table.
- Every write endpoint authenticates, checks the role server-side, verifies
  same-origin, and scopes rows by the authenticated `sub`.

---

## 5. Routes

| Route | State |
| --- | --- |
| `GET /api/health` | M0 |
| `GET /api/session` | M0 (starter) |
| `GET /api/boards` | M0 — tree, counts, latest post per board |
| `GET /api/boards/:id` | M1 — board thread list |
| `GET /api/threads/:slug` | M1 — thread, sanitised post HTML, embeds, authors, tags |
| `GET /api/users/:handle` | M1 — public profile, stats, recent posts |
| `PATCH /api/me` | M1 — profile edits (allowlisted role tags and colours) |
| `POST /api/threads`, `POST /api/threads/:slug/posts` | M1 — trust-gated posting |
| `POST /api/reports` | M2 — member report, one per post |
| `GET /api/mod/reports`, `POST /api/mod/reports/:id/action` | M2 — queue and actions |
| `POST /api/mod/users/:id/warnings`, `POST /api/mod/warnings/:id/revoke` | M2 |
| `POST /api/mod/users/:id/notes` | M2 — staff-only notes |
| `GET /api/admin/boards`, `POST/PATCH /api/admin/categories` and `/boards` | M2 — board manager |
| `GET /api/admin/audit` | M2 — admin-only audit trail |
| `POST /api/uploads`, `GET /api/files/:id` | M3 — stripped images in R2 |
| `GET/POST /api/notifications`, `POST /api/realtime/ticket` | M3 |
| `GET /api/mod/boards`, `PATCH /api/mod/boards/:id/image` | M3 — staff board art |
| `GET /api/donations`, `GET/PATCH/POST/DELETE /api/admin/donations/*` | M4 — public methods and owner settings |
| `GET/POST /api/admin/supporters` | M4 — manual Supporter grants and revocations |

UI routes: `/` (board index), `/b/:id` (board), `/b/:id/new`, `/t/:slug`
(thread), `/u/:handle` (profile), `/foia` (FOIA library), `/donate` (donation
page), `/mod` (staff report queue), `/admin` (board manager, donations,
Supporters, and audit log). Client-side history routing, SPA fallback from the
assets binding.

---

## 6. Safety rules (non-negotiable)

1. **No raw user CSS/HTML.** Cosmetics are allowlisted enums and validated hex
   values assembled into a CSS custom property server-side.
2. **Doxxing is held, not silently blocked.** Addresses, phones, and SSNs route
   posts to `held` with a reason; authors and staff can see them; staff approve.
   FOIA content legitimately contains addresses, so review must be human.
3. **Strip metadata on upload.** No stored image keeps EXIF GPS or device
   identifiers; the original is never persisted. Client canvas re-encode plus
   a server container rewrite (JPEG APPn, PNG eXIf/text, WebP EXIF/XMP).
4. **No video files.** Video is embedded from an allowlisted provider and only
   its `{provider, id}` is stored; timestamps seek the provider player.
5. **Every staff action is logged** with actor, target, action, reason, and time.
6. **Rich text is sanitised twice.** TipTap produces HTML in the browser;
   DOMPurify filters it before saving, and the Worker independently parses and
   sanitises it with `rehype-sanitize`. Editor styles are converted to
   allowlisted classes, and raw HTML/CSS is never stored. Legacy Markdown posts
   still pass through `remark-parse` → `remark-gfm` → `rehype-sanitize` →
   `rehype-stringify`. Media embeds are extracted as `{provider, id}`
   descriptors and the browser builds the iframe URL from the allowlisted
   provider, never from the user's raw URL.
7. **Turnstile on registration** once site keys exist; rate limits live in D1.

---

## 7. Milestones

| # | Scope | Status |
| --- | --- | --- |
| M0 | Starter, design system, schema + seed, board index, thread view | **Done** |
| M1 | Accounts, profiles, trust levels, rich posting + legacy Markdown, embeds | **Done** |
| M1.5 | Search, reactions, bookmarks, quote storage | Next |
| M2 | Report queue, warnings, audit log, admin board manager | **Done** |
| M3 | R2 uploads with EXIF strip, FOIA library, timestamps, realtime | **Done** |
| M4 | Owner-editable donations, manual Supporters, optional badge | **Done** |
| M5 | Security review, Turnstile, ToS/DMCA, seed content, publish | Planned |

---

## 8. Build workflow

- One sub-feature per prompt, with this file attached.
- Verify each milestone with `bun run typecheck`, `bun test`, `bun run build`.
- Seed content is idempotent and lives in `src/worker/seed.ts`; never reseed a
  deployed database by hand.
- Secrets live in Sites → Secrets, never in the repo. Placeholders are listed
  in `.env.example`.
