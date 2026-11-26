# PublicLens

A charcoal First Amendment audit forum: field reports, law and FOIA resources,
gear, and civil discussion. Built on Freebuff Sites (Cloudflare Workers).

## Start and check

```sh
bun install
bun run dev
bun test
bun run typecheck
bun run build
```

Open the URL printed by Vite (port 3000). The server binds to `0.0.0.0` for
Cloud previews and runs the Worker against a local D1 database. The schema and
starter content are created on first request.

## Layout

- `PROJECT_SPEC.md` — stack decisions, palette, roles, data model, milestones.
- `src/client/main.tsx` — shell, header, session, and history routing.
- `src/client/views.tsx` — board index and thread view with embeds and replies.
- `src/client/pages.tsx` — board, new-thread, and profile pages (with staff tools).
- `src/client/mod.tsx` — staff report queue and actions.
- `src/client/admin.tsx` — admin board manager and audit log.
- `src/client/editor.tsx` — the TipTap new-thread and reply editor with popovers.
- `src/client/rich-sanitize.ts` — the browser DOMPurify pass and class filter.
- `src/client/rich-extensions.ts` — TipTap extension configuration.
- `src/client/media.tsx` — browser resize/re-encode and upload controls.
- `src/client/notifications.tsx` — the header notification bell.
- `src/client/donate.tsx` — the public donation page and payment methods.
- `src/client/donations-admin.tsx` — admin donation settings and Supporter grants.
- `src/worker/donations.ts` — donation settings and payment-method CRUD.
- `src/worker/supporters.ts` — manual Supporter grants and revocations.
- `src/client/foia.tsx` — the downloadable records-request library.
- `src/client/ui.tsx` — shared chips, avatars, embeds, and loading states.
- `src/client/style.css` — the charcoal design system.
- `src/worker/app.ts` — read API, session, posting, and profile routes.
- `src/shared/richtext.ts` — palette, classes, allowlists, and URL rules.
- `src/worker/markdown.ts` — legacy sanitised Markdown, providers, and timestamps.
- `src/worker/richtext.ts` — TipTap HTML sanitizer and class mapping.
- `src/worker/media.ts` — R2 uploads, image sniffing, and metadata stripping.
- `src/worker/notifications.ts` — durable notifications and unread counts.
- `src/worker/realtime.ts` — Sites realtime tickets and publication.
- `src/worker/mutations.ts` — thread and reply writes with trust gating.
- `src/worker/moderation.ts` — reports, warnings, mutes, and mod notes.
- `src/worker/boards-admin.ts` — board manager writes.
- `src/worker/audit.ts` — the append-only staff audit log.
- `src/worker/roles.ts` — role checks for reads and posting.
- `src/worker/users.ts` — lazy account provisioning and profile edits.
- `src/worker/trust.ts` — derived trust levels and post limits.
- `src/worker/db.ts` — migrations bootstrap and queries.
- `src/worker/schema.ts` — Drizzle table definitions.
- `src/worker/migrations.ts` — versioned DDL applied through `schema_meta`.
- `src/worker/seed.ts` — board tree and starter threads.
- `src/worker/auth.ts` — Sign in with Freebuff.

## Accounts and posting

Sign in with Freebuff provisions a local `users` row on first request. Roles and
trust levels are computed server-side: new accounts cannot post links and are
limited to three posts an hour until they have three posts and a day-old
account. New posts are written in the TipTap WYSIWYG editor; their canonical
HTML is sanitised in the browser and again in the Worker, with derived plain
text stored for excerpts. Legacy Markdown posts still render through the
sanitised Markdown path. YouTube and Rumble links become embeds, X links become
link cards.

## Moderation

Members can report a post once, with a reason and optional details. Moderators
work the queue at `/mod`: claim, dismiss, remove the post, lock the thread, or
issue a warning. Warnings carry 1–3 points and live for 90 days; three active
points mute the account for 24 hours. Admins manage the board tree at `/admin`
(create, rename, reorder, archive, read/post permissions) and read the audit
log, which records every staff action. When no hosted auth is configured (local
dev and the preview server), the preview account is promoted to admin so both
pages are demoable; Sites always injects auth config, so a deployment never
falls into that mode.

## Media, FOIA, and notifications

Images are resized and re-encoded in the browser, then stripped again by the
Worker before they reach R2: JPEG APPn segments, PNG text/eXIf chunks, and WebP
EXIF/XMP are removed. Avatars are 256 px crops; post images are capped at 1600 px
and 2 MB; board banners are uploaded by staff at `/mod`. Video is never uploaded:
paste a YouTube, Rumble, Vimeo, PeerTube, or Archive.org link and only the
provider and id are stored. Timestamps such as `12:34` become seek links in a
thread that has a video.

The FOIA library at `/foia` renders plain-text templates in the browser, so a
download or copy never touches R2. Replies, mentions, warnings, and report
updates create D1 notifications; the bell polls and uses the Sites realtime room
when the deployment provides `REALTIME`. Local preview has no realtime binding,
so it falls back to polling.

## Donations and Supporters

The public `/donate` page lists payment methods the owner controls (PayPal,
Venmo, Cash App, Zelle, Ko-fi, Buy Me a Coffee, or other public handles/links).
There is no checkout, payment processor, or webhook: supporters pay directly,
then an admin grants status from `/admin` after confirming the payment. Grants
never expire; revoking one immediately ends Supporter board access. Supporters
can hide their badge from **Edit profile** while keeping access. Every donation
setting, payment-method change, and Supporter grant or revocation is audited,
and grants send an in-app notification.

## Publish with Freebuff

1. Create or inspect the site and target the preview environment.
2. Enable Sign in with Freebuff with `sites_enable_auth`; use its development
   variables for local sign-in only.
3. Provision D1 storage as `DB` and R2 storage as `FILES`.
4. Run `sites_prepare_realtime` and keep `"realtime": true` in `deploy.json`.
5. Build and deploy with `sites_deploy` and `deploy.json`.

Never commit real credentials. Set them in Sites → Secrets; the expected names
are listed in `.env.example`.
