# PublicLens Progress

Last updated: 2026-11-25

- Branch: `freebuff/546322336542980ac576b88b`
- Site: `a3ead2fc-9fa7-426d-af34-eb9a489d93dc` (Freebuff Sites)
- Preview: <https://publiclens-wxpb0d-preview.freebuff.site> — published, serving M4
- Production: <https://publiclens-wxpb0d.freebuff.site> — not published
- Repository: all PublicLens files are currently untracked; no project commit yet

Scope source of truth: `PROJECT_SPEC.md`. Agent rules: `AGENTS.md`.

## Status at a glance

| Area | State |
| --- | --- |
| M0 foundation | Complete |
| M1 accounts, profiles, posting | Complete |
| M2 moderation and admin | Complete |
| M3 media, FOIA, notifications | Complete |
| M4 donations and Supporters | Complete |
| M5 hardening and launch | Planned, not implemented |
| Preview deployment | M4 live; M5 not deployed |
| Production deployment | Not requested, not published |

Last full verification (M4): client `tsc --noEmit`, worker
`tsc --noEmit -p tsconfig.worker.json`, `bun test` (27 passed, 0 failed), and
`bun run build` all passed. No failing checks are known as of that verification.

## Completed

### M0 — foundation
- React 19 + Vite 8 client and Hono Worker in one deployable.
- Charcoal design system, palette tokens, dark-only layout, responsive boards.
- D1 schema, Drizzle definitions, versioned migrations, idempotent seed.
- Board index and thread view, pinned/locked threads, board stats.

### M1 — accounts, profiles, posting
- Sign in with Freebuff; lazy `users` provisioning with unique handles.
- Public profiles, profile editing, allowlisted role tags and avatar colours.
- Derived trust levels: link gating and hourly post limits.
- Thread creation and replies with server-side validation.
- Sanitised Markdown, YouTube/Rumble/Vimeo/PeerTube/Archive.org embeds, X link
  cards, and no raw HTML.

### M2 — moderation and administration
- Member reports, one per post, with reasons and details.
- Staff report queue: claim, dismiss, remove post, lock thread, warn user.
- Warnings (1–3 points, 90-day life), 24-hour mute at 3 active points, revoke.
- Staff notes and append-only audit log for every staff action.
- Admin board manager: categories, boards, ordering, read/post permissions,
  archive/restore.

### M3 — media, FOIA, notifications
- R2 uploads with magic-byte sniffing and server-side metadata stripping for
  JPEG, PNG, and WebP; browser resize/re-encode first.
- Avatars, staff-managed board banners, in-post images; no video uploads.
- FOIA template library with in-browser copy/download.
- Timestamp links that seek a thread's video.
- D1 notifications for replies, mentions, warnings, and report updates.
- Sites realtime ticket scoped to the signed-in user's own room; polling
  fallback when `REALTIME` is absent.

### M4 — donations and Supporters
- Owner-editable donations intro and payment-memo note.
- Admin-managed payment methods (PayPal, Venmo, Cash App, Zelle, Ko-fi, Buy Me
  a Coffee, other) with enable/disable and ordering.
- Public `/donate` page with copy buttons and optional https links.
- Manual admin Supporter grants/revocations, members only, no expiry.
- Donor-controlled Supporter badge visibility; hidden badge keeps access.
- Audit entries and in-app notifications for grants/revocations.
- Fixed: non-Supporters no longer send `showSupporterBadge` on profile save.

## Broken, risky, or in progress

### M5 — hardening and launch (not started)

No M5 code has been written yet. The following are code-review findings from the
current source; they are not yet fixed.

1. **Staff-only profile excerpts can leak.**
   `getProfile` in `src/worker/db.ts` builds the latest-posts list with
   `posts` → `threads` but does not join `subcategories` or filter
   `staff_only`. A public profile can therefore show excerpts and thread titles
   from staff-only boards. Expected: only Supporters, moderators, and admins.
2. **Staff-only post images are publicly fetchable.**
   `media` has no `staff_only` column; `mediaForFile` only derives restricted
   access for board banners. An image referenced in a staff-only thread can be
   fetched by UUID without a session. Expected: gate post media by its
   staff-only board, and mark media when a board becomes staff-only.
3. **Moderation staff/self boundaries are incomplete.**
   `issueWarning` only blocks a non-admin from warning an admin, so a moderator
   can warn themselves or another moderator. `revokeWarning` has no self/staff
   check. `applyReportAction` lets a moderator remove or lock content authored
   by staff, or handle a report they filed themselves. Expected: no
   self-moderation, and only admins act on staff accounts/content.
4. **Turnstile is not implemented.**
   `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY` exist only as
   `.env.example` placeholders. Registration still provisions a local account
   on the first authenticated request. The preview environment has no custom
   variables set (0 of 25).
5. **No Terms or DMCA pages.**
   `/terms` and `/dmca` do not exist, and the footer has no legal links. A DMCA
   agent contact (email and postal address) has not been supplied.
6. **Seed content is stale and over the requested range.**
   `src/worker/seed.ts` contains 14 threads (target was 8–12). The pinned
   `boards-are-open` notice still says accounts, posting, and reports are
   coming next, and `strip-metadata-before-you-upload` says stripping will ship
   even though it already does. The deployed database has the `seed:v1` marker,
   so source edits will not reach it without an idempotent `seed:v2` update.
7. **Realtime delivery on Sites is unverified.**
   Notifications and polling work locally. Delivery through the deployed
   `REALTIME` binding has not been observed on the preview origin.

### Other gaps

- M1.5 search, reactions, bookmarks, and quote storage are not built; they are
  planned in `PROJECT_SPEC.md` and are not launch blockers.
- No dedicated Supporters Lounge board was seeded. Admins can create one with
  the existing board manager.
- No email/transactional mail integration; notifications are in-app only.
- The 14 seed threads exceed the M5 target of 8–12. Keeping them avoids empty
  boards; trimming two gear threads would match the range exactly.

## Exact next step

**Do this first:** fix the two staff-only data leaks, with regression tests.

1. In `src/worker/db.ts`, add a `subcategories` join and a viewer-role bind to
   the recent-posts query inside `getProfile`, so staff-only threads are
   excluded for public viewers.
2. Add migration 6 and matching `schema.ts` changes for
   `media.staff_only INTEGER NOT NULL DEFAULT 0`; set it when a board banner is
   attached or a post is created in a staff-only board, and make
   `GET /api/files/:id` return 404 for restricted media to viewers below
   Supporter.
3. Add tests in `tests/app.test.ts`: public profile hides staff-only excerpts;
   public file fetch fails for staff-only post media; a Supporter can still
   read both.
4. Then continue M5 in this order: moderation staff/self guards → Turnstile
   registration gate → `/terms` and `/dmca` pages and footer links → seed v2
   copy refresh → `bun run typecheck`, `bun test`, `bun run build` → preview
   deploy.

## Inputs or authorization still needed

- **Turnstile:** real site key and secret for production. The site key is
  public; the secret must be set in Sites → Secrets. The preview can use
  Cloudflare's documented always-pass test keys to exercise the flow, but those
  must not be treated as production protection.
- **DMCA agent:** a real contact email and postal address for `/dmca`. A
  clearly marked placeholder will be used until they are provided.
- **Production:** publishing the production environment has not been
  authorized. M5 calls for a preview deployment only.
