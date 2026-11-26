# PublicLens Progress

Last updated: 2026-11-26

- Branch: `freebuff/546322336542980ac576b88b`
- Site: `a3ead2fc-9fa7-426d-af34-eb9a489d93dc` (Freebuff Sites)
- Preview: <https://publiclens-wxpb0d-preview.freebuff.site> — published, serving M5
  plus the Markdown posting editor (deployed 2026-11-26T00:35:49Z); the rich
  editor is local and has not been deployed
- Production: <https://publiclens-wxpb0d.freebuff.site> — not published
- Repository: all PublicLens files are currently untracked; no project commit yet

Scope source of truth: `PROJECT_SPEC.md`. Agent rules: `AGENTS.md`.

## Status at a glance

| Area | State |
| --- | --- |
| M0 foundation | Complete |
| M1 accounts, profiles, posting | Complete |
| M1.5 search, reactions, bookmarks, quote storage | Not built (not a launch blocker) |
| M2 moderation and admin | Complete |
| M3 media, FOIA, notifications | Complete |
| M4 donations and Supporters | Complete |
| M5 hardening and launch | Code complete: leaks, guards, Turnstile, legal pages, seed v2 |
| Posting editor | Complete: TipTap rich text, popovers, two sanitizer passes, tests |
| Preview deployment | M5 + Markdown editor live; rich editor local, not deployed |
| Production deployment | Not requested, not published |

Last full verification (rich-text editor): client `tsc --noEmit`, worker
`tsc --noEmit -p tsconfig.worker.json`, `bun test` (40 passed, 0 failed), and
`bun run build` all passed. The editor was also loaded in the local signed-in
preview at desktop and 390 px, including a simulated 420 px keyboard viewport;
no console errors and no toolbar overflow were observed.

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

### M5 — hardening (code complete)
1. **Staff-only profile excerpts fixed.** `getProfile` in `src/worker/db.ts`
   joins `subcategories` and binds the viewer's read role, so recent-post
   excerpts and titles from staff-only boards are hidden below Supporter.
2. **Staff-only post images fixed.** Migration 6 adds
   `media.staff_only INTEGER NOT NULL DEFAULT 0`. Images referenced from a
   staff-only board, and banners on staff-only boards, return 404 to anyone
   below Supporter; public images stay public. Flags rise when a post is created
   in a staff-only board, when an admin seals a board, and when a banner is
   attached.
3. **Moderation staff/self guards.** Nobody warns or revokes a warning on
   themselves; only admins act on staff accounts, posts, or threads; nobody
   handles a report they filed or a report about their own post.
4. **Turnstile registration gate.** The first authenticated request provisions
   an account only with a verified `X-Turnstile-Token` when
   `TURNSTILE_SECRET_KEY` is set; existing accounts and unconfigured builds are
   unaffected. The SPA renders the dark widget from
   `VITE_TURNSTILE_SITE_KEY` and retries `/api/session` with the token.
5. **Legal pages.** `/terms` and `/dmca` with footer links. The DMCA agent block
   is a clearly marked placeholder (name, email, postal address).
6. **Seed v2.** Idempotent `seed:v2` marker retires two extra gear threads
   (12 remain) and refreshes the stale pinned notice and metadata thread copy
   for databases that already hold `seed:v1`. A retired thread is kept if a
   member replied, so user content is never deleted.
7. **Seed clock repaired.** Worker module scope evaluates with time 0, so the
   v1/v2 seed wrote negative (`0 - offset`) timestamps. `seedV1` now reads the
   clock per request, and the idempotent `seed:v3` marker shifts existing
   seed-owned user, thread, and post timestamps by the request clock. Positive
   activity from a real reply is left alone. A regression test seeds a
   zero-clock database, runs the repair, and checks the shift and idempotency.
8. **Mobile header and notifications.** On screens up to 640 px the account
   cluster (bell, avatar, sign out) is pushed to the right corner, and the
   notification panel is anchored below the full two-row header instead of to
   the bell, so it no longer covers the nav or runs off-screen.

### Rich-text posting editor
- New posts use TipTap 3: bold, italic, underline, strikethrough, a 16-colour
  teardrop palette, seven font sizes, blockquote, alignment, lists, links,
  local images, emoji, code blocks, and undo.
- New threads use the “Create New Thread” panel with a recessed Thread Title,
  prefix picker, black canvas, beveled POST button, and the icon toolbar;
  replies reuse the same panel and quote into a TipTap blockquote.
- The browser filters saved HTML with DOMPurify. The Worker re-parses it with
  `rehype-sanitize`, maps colour/size/alignment styles to `.tx-*`, `.fs-*`, and
  `.align-*` classes, restricts images to `/api/files/<uuid>`, and stores the
  canonical HTML in `posts.body_html`. `posts.body` is derived plain text.
- Legacy Markdown rows keep `body_html = NULL` and still render through the
  old sanitised Markdown path. The client render pass allows both rich and
  legacy formatting classes.
- Migration 7 adds `posts.body_html`; rich JSON writes have a 512 KB transport
  ceiling but the plain-text limit remains 10,000 characters.
- Poll/Embed deliberately inserts an external URL. Known video/poll links use
  the existing embed descriptors; native in-app polling is still out of scope.

Regression tests cover the two leaks, the moderation boundaries, the Turnstile
gate, the seed counts, the seed-clock repair, rich-HTML class mapping, script
and URL stripping, derived plain text, rich link gating, and the legacy
Markdown path.

## Broken, risky, or in progress

### Launch checks still open
1. **Realtime delivery on Sites is unverified.** Notifications and polling work
   locally. Delivery through the deployed `REALTIME` binding has not been
   observed on the preview origin.
2. **DMCA agent is a placeholder.** The `/dmca` page needs the owner's real
   agent name, email, and postal address, registered with the U.S. Copyright
   Office.
3. **Turnstile keys are not set.** The preview environment has no custom
   variables (0 of 25). `VITE_TURNSTILE_SITE_KEY` must be present at build time
   and `TURNSTILE_SECRET_KEY` set in Sites → Secrets before the gate is active.
4. **The rich editor is not deployed yet.** The preview still serves the
   Markdown toolbar build. The rich editor has been exercised signed-in on the
   local preview (desktop and 390 px); a deployed signed-in pass is still
   needed after the next preview deploy.

### Other gaps
- M1.5 search, reactions, bookmarks, and quote storage are not built; they are
  planned in `PROJECT_SPEC.md` and are not launch blockers.
- No dedicated Supporters Lounge board was seeded. Admins can create one with
  the existing board manager.
- No email/transactional mail integration; notifications are in-app only.
- The audio and streaming boards have no seeded threads after the v2 trim; they
  remain in the board tree as empty boards.
- The local-preview demo identity is promoted to admin whenever hosted auth is
  absent, which is intended for `/mod` and `/admin` demos; a deployment always
  injects auth config and never takes that branch.

## Exact next step

The rich-text editor is implemented and verified locally. The published
preview still serves the Markdown build. Remaining work:

1. Deploy the rich editor to preview when requested, then verify signed-in
   posting, quote, link, image, and rendered-post paths on that origin.
2. Verify realtime notification delivery on the preview origin while signed in
   as two accounts.
3. Replace the DMCA agent placeholder once the owner supplies the details.
4. Set `VITE_TURNSTILE_SITE_KEY` for the build and `TURNSTILE_SECRET_KEY` in
   Sites → Secrets, then confirm a first sign-in is challenged and a returning
   sign-in is not.
5. Re-run `bun run typecheck`, `bun test`, and `bun run build` before the next
   deploy.

## Inputs or authorization still needed

- **Turnstile:** real site key and secret for production. The site key is
  public; the secret must be set in Sites → Secrets. The preview can use
  Cloudflare's documented always-pass test keys to exercise the flow, but those
  must not be treated as production protection.
- **DMCA agent:** a real contact email and postal address for `/dmca`. The page
  shows a clearly marked placeholder until they are provided.
- **Production:** publishing the production environment has not been
  authorized. M5 calls for a preview deployment only.
