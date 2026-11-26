# PublicLens Handoff

Last updated: 2026-11-26

- Repository: `joedritwit/new`
- Branch: `main`
- Freebuff Sites project: `a3ead2fc-9fa7-426d-af34-eb9a489d93dc`
- Preview: <https://publiclens-wxpb0d-preview.freebuff.site> — published
- Production: <https://publiclens-wxpb0d.freebuff.site> — not published
- Scope source: `PROJECT_SPEC.md`
- Agent rules: `AGENTS.md`
- Historical status: `PROGRESS.md` (some deployment/test details are older than this handoff)

## What PublicLens is

PublicLens is a dark, charcoal-themed First Amendment audit forum for field
reports, law and FOIA resources, gear discussion, and civil debate. It is a
single deployable: a React SPA served with a Hono API on Cloudflare Workers,
with D1 for persistence, R2 for images, Freebuff auth, and managed Sites
realtime.

## Architecture

| Layer | Choice |
| --- | --- |
| Client | React 19 + TypeScript + Vite 8, hand-written history routing |
| API | Hono 4 in the same Worker, static assets + SPA fallback |
| Runtime | Cloudflare Workers via Freebuff Sites; no Node/Bun server at runtime |
| Database | Cloudflare D1 (SQLite) + Drizzle ORM, versioned SQL migrations |
| Files | R2 binding `FILES`; images only, metadata stripped before storage |
| Auth | `@freebuff/auth` / Sign in with Freebuff (OIDC, HttpOnly session) |
| Realtime | Sites managed `REALTIME` Durable Object for notification wakeups |
| Rich text | TipTap 3, DOMPurify in the browser, `rehype-sanitize` in the Worker |
| Legacy content | Markdown rendered through `remark` → `rehype-sanitize` |
| Tests | Bun test + Miniflare integration tests in `tests/app.test.ts` |
| Deploy | Freebuff Sites with `deploy.json`; preview only when requested |

### Important source areas

- `src/client/main.tsx` — shell, session, header, and route dispatch.
- `src/client/views.tsx` — board index, thread view, replies, quote flow.
- `src/client/pages.tsx` — board, new-thread, profile, and staff pages.
- `src/client/editor.tsx` — TipTap editor, title canvas, toolbar, popovers.
- `src/client/rich-sanitize.ts` — browser DOMPurify pass and class/URL rules.
- `src/client/rich-extensions.ts` — TipTap extension configuration.
- `src/shared/richtext.ts` — palette, classes, allowlists, RGB/hex normalization.
- `src/worker/richtext.ts` — Worker sanitizer, style-to-class mapping, links.
- `src/worker/app.ts` — API routes, request validation, authorisation.
- `src/worker/mutations.ts` — thread/reply writes and trust gating.
- `src/worker/db.ts` — migrations bootstrap and read queries.
- `src/worker/schema.ts` / `migrations.ts` — Drizzle schema and append-only DDL.
- `src/worker/markdown.ts` — legacy Markdown, embeds, timestamp links.
- `src/worker/media.ts` — R2 uploads, image sniffing, metadata stripping.
- `src/worker/auth.ts` — Freebuff auth and local-preview seam.
- `tests/app.test.ts` — integration/security regressions.

### Rich-text pipeline

New posts are edited in TipTap. The client runs DOMPurify before submitting.
The Worker independently parses and sanitizes the HTML with `rehype-sanitize`,
converts inline editor styles into allowlisted classes, hardens links, restricts
images to `/api/files/<uuid>`, and stores canonical HTML in `posts.body_html`
while deriving plain text into `posts.body`.

Editor colours map to `.tx-*`, font sizes to `.fs-*`, and alignment to
`.align-*`; stored HTML never contains inline CSS. The latest sanitizer fix
normalizes palette colours emitted as `rgb(...)`/`rgba(..., 1)` to hex before
palette lookup, so TipTap's serialized colours survive the round trip.

Legacy posts have `body_html = NULL` and still render through the sanitized
Markdown path. The client render pass allows both rich and legacy formatting
classes.

### Data and safety

- Core tables: `users`, `categories`, `subcategories`, `threads`, `posts`,
  `tags`, `thread_tags`, plus reports, warnings, mod notes, audit log, media,
  notifications, donation settings/methods, and schema metadata.
- Migration 7 added nullable `posts.body_html`.
- All writes authenticate and authorise server-side, enforce same-origin, and
  scope data by the authenticated user.
- Trust levels are derived, not client-supplied: new accounts cannot post
  external links and are limited to 3 posts/hour; links and higher limits
  unlock with account age and published-post count.
- Images are JPEG/PNG/WebP only, re-encoded client-side, stripped again in the
  Worker, and stored in R2. Video is embedded from allowlisted providers, never
  uploaded.
- Staff actions are audited; reports, warnings, mutes, board management, and
  donation/Supporter actions are role-gated.

## Completed features

- M0: React/Vite client, Hono Worker, charcoal design system, D1 schema,
  migrations, seed, board index, thread view.
- M1: Freebuff sign-in, lazy profiles, profile editing, trust levels, thread
  creation/replies, embeds, link cards, legacy Markdown rendering.
- M2: member reports, staff queue, claims, warnings, mutes, mod notes,
  append-only audit log, admin board/category management.
- M3: R2 image uploads with metadata stripping, avatars, board banners,
  in-post images, FOIA library, timestamp seek links, D1 notifications,
  realtime tickets with polling fallback.
- M4: owner-managed donation page and payment methods, manual Supporter
  grants/revocations, optional badge visibility, audit/notification hooks.
- M5: staff-only profile/media leak fixes, moderation self/staff guards,
  Turnstile registration gate, terms/DMCA pages, seed v2/v3 repairs, mobile
  header/notification fixes.
- Rich-text editor: TipTap toolbar and popovers, formatting/size/colour/
  alignment/lists/links/images/emoji/code, quote-to-blockquote replies,
  mobile keyboard-aware layout, browser + Worker sanitizers, derived plain text,
  legacy fallback.
- Latest fix: RGB/RGBA palette colours are normalized to hex and stored as
  `tx-*` classes; regression coverage added.

## Verification

At this checkpoint:

- `bun run typecheck` — passed.
- `bun test` — **41 passed, 0 failed**, 360 assertions.
- `bun run build` — passed.
- Local signed-in browser checks covered desktop and 390 px mobile layouts,
  the formatting popover, colour/size palettes, active states, and a simulated
  420 px keyboard viewport. No console errors were observed.
- The existing colour-mark regression was reproduced against the editor's
  `getHTML()` output and fixed in the shared normalizer.

The build emits the existing Vite warning about a client chunk over 500 kB
(about 778 kB minified). It is a warning, not a failed build.

## Known issues and risks

1. **The latest colour fix is not deployed.** The published preview serves a
   rich-editor build from before the RGB normalization change. A preview
   deployment is required before testing the fix on the public origin.
2. **The existing “Hellohello” post cannot recover its colour.** The colour
   value was dropped before storage; the stored HTML has plain `<span>`s. It
   must be re-entered/reposted to display colour. Do not claim a data migration
   can restore an unknown colour.
3. **Deployed signed-in paths are not fully verified.** The rich editor was
   exercised in the local preview, but a deployed signed-in pass over posting,
   quotes, links, images, and rendered posts is still needed.
4. **Realtime delivery through Sites `REALTIME` is unverified.** The app has
   local polling fallback and ticket tests; two-account delivery on the preview
   origin has not been observed.
5. **DMCA details are placeholders.** `/dmca` needs the owner's real agent name,
   email, and postal address, registered with the U.S. Copyright Office.
6. **Turnstile keys are not configured.** `VITE_TURNSTILE_SITE_KEY` must be
   present at build time and `TURNSTILE_SECRET_KEY` must be set in Sites →
   Secrets before the registration gate is active.
7. **Production is not published.** Only preview publication has been used.
8. **M1.5 is not built:** search, reactions, bookmarks, and quote storage remain
   planned and are not launch blockers.
9. **Native polls are out of scope.** “Poll / Embed” inserts an external URL;
   known providers render through the existing embed path.
10. **No email/transactional mail.** Notifications are in-app only.
11. **The local-preview demo identity is promoted to admin when hosted auth is
    absent.** This is intentional for `/mod` and `/admin` demos; deployments
    always inject auth config and do not use that branch.

## Immediate next steps

1. Deploy the latest build to the preview environment when authorised, using
   `deploy.json` and the current `dist/`; inspect the deployment receipt and
   published status.
2. On the deployed preview, sign in and post a fresh coloured paragraph. Confirm
   the stored/rendered HTML contains `.tx-*` classes and that the colour is
   visible. Repost the affected “Hellohello” content if it should be coloured.
3. Exercise the deployed signed-in editor paths: bold/italic/underline, sizes,
   colour, alignment, lists, external link, image upload, quote reply, and
   rendered-post output.
4. Verify realtime notification delivery with two signed-in accounts; confirm
   polling fallback if `REALTIME` is unavailable.
5. Configure Turnstile and the DMCA contact, then confirm the first sign-in is
   challenged and the legal page is complete.
6. Run `bun run typecheck`, `bun test`, and `bun run build` before any further
   deployment.
7. Pick up M1.5 (search, reactions, bookmarks, quote storage) only after the
   launch checks above are settled.

## Commands

```sh
bun install
bun run dev
bun run typecheck
bun test
bun run build
```

`bun run dev` binds to `0.0.0.0` for Cloud previews and uses local D1/R2
bindings. Schema migrations and seed content run on the first request.

## Deployment notes

- The project is a Workers + static-assets app, not Next.js; do not run
  `sites_prepare_next`.
- `deploy.json` points at `dist/publiclens/index.js` and `dist/client`, with
  `spa` and `realtime` enabled.
- Preview environment has D1 `DB`, R2 `FILES`, and `REALTIME` attached.
- Secrets belong in Sites → Secrets. Never commit `.env.local`, `.dev.vars`, or
  any real credential. `.env.example` contains placeholders only.
- Migrations run automatically on the first request after deployment; never
  edit an applied migration.
