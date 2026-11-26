# AGENTS.md — PublicLens

PublicLens is a charcoal, dark-only First Amendment audit forum: field reports,
law and FOIA resources, gear, and civil discussion. It is hosted on Freebuff
Sites (Cloudflare Workers).

`PROJECT_SPEC.md` is the source of truth for scope, vocabulary, palette, roles,
data model, and milestones. Read it before changing behaviour. `PROGRESS.md`
records what is done and what is next.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript, Vite 8, `@vitejs/plugin-react` |
| API | Hono 4 in the same Worker |
| Runtime | Cloudflare Workers with static assets and SPA fallback; no Node/Bun server, containers, or long-lived processes |
| Database | Cloudflare D1 (SQLite); Drizzle ORM for typed reads, prepared D1 statements elsewhere |
| Migrations | Append-only ordered SQL in `src/worker/migrations.ts`, tracked by `schema_meta` |
| Files | R2 binding `FILES`; images only; metadata stripped before storage |
| Auth | `@freebuff/auth` (Sign in with Freebuff, OIDC, HttpOnly session cookie); no passwords |
| Realtime | Sites managed `REALTIME` Durable Object binding for notification wakeups; D1 is the source of truth |
| Rich text | TipTap 3 + DOMPurify in the browser; `rehype-sanitize` again in the Worker; legacy Markdown remains readable |
| Tests | `bun test` + Miniflare integration tests in `tests/app.test.ts` |
| Package manager | Bun with `bun.lock` |
| Deploy | Freebuff Sites with `deploy.json`; preview only on request, production only with explicit approval |

Deliberate constraints: no PostgreSQL/Prisma, no native modules (bcrypt, sharp),
no cron, no payment processor or webhooks. Donations are owner-managed public
payment methods; Supporter status is granted manually.

## Folder structure

```text
.
├── src/
│   ├── client/                 React SPA
│   │   ├── main.tsx            shell, session, history routing, header/footer
│   │   ├── views.tsx           board index and thread view
│   │   ├── pages.tsx           board, new-thread, profile pages
│   │   ├── mod.tsx             staff report queue and actions
│   │   ├── admin.tsx           board manager and audit log
│   │   ├── donations-admin.tsx admin donation settings and Supporter grants
│   │   ├── donate.tsx          public donation page
│   │   ├── editor.tsx          TipTap post editor, toolbar, and popovers
│   │   ├── rich-sanitize.ts    browser DOMPurify pass and class filter
│   │   ├── rich-extensions.ts  TipTap extension setup
│   │   ├── media.tsx           browser resize/re-encode and upload controls
│   │   ├── notifications.tsx   header notification bell
│   │   ├── foia.tsx            downloadable records-request library
│   │   ├── ui.tsx              shared chips, avatars, embeds, loading states
│   │   ├── api.ts              navigate() and send() helpers
│   │   └── style.css           charcoal design system
│   ├── shared/                 code used by both client and Worker
│   │   ├── types.ts            API DTOs
│   │   ├── forum.ts            limits, prefixes, role tags, report reasons
│   │   ├── richtext.ts         palette, classes, allowlists, URL rules
│   │   ├── donations.ts        payment-method presets and limits
│   │   └── foia.ts             FOIA templates
│   └── worker/                 Hono API on Cloudflare Workers
│       ├── index.ts            Worker entrypoint; wraps auth around the app
│       ├── app.ts              routes, middleware, authorise(), request validation
│       ├── auth.ts             Freebuff auth, local-preview seam, Env type
│       ├── db.ts               migrations bootstrap, board/thread/profile reads
│       ├── schema.ts           Drizzle table definitions
│       ├── migrations.ts       versioned DDL (append-only)
│       ├── seed.ts             idempotent board tree and starter threads
│       ├── roles.ts            role ranking and read/post checks
│       ├── users.ts            lazy provisioning and profile edits
│       ├── trust.ts            derived trust levels and post limits
│       ├── mutations.ts        thread/reply writes and trust gating
│       ├── moderation.ts       reports, warnings, mutes, mod notes
│       ├── boards-admin.ts     category/board CRUD and ordering
│       ├── media.ts            R2 uploads, sniffing, metadata stripping
│       ├── donations.ts        donation settings and payment-method CRUD
│       ├── supporters.ts       manual Supporter grants and revocations
│       ├── notifications.ts    durable notifications and unread counts
│       ├── realtime.ts         Sites realtime tickets and publication
│       ├── audit.ts            append-only staff audit log
│       ├── markdown.ts         legacy Markdown, embeds, timestamp links
│       ├── richtext.ts         TipTap HTML sanitizer and class mapping
│       ├── text.ts             slugify and control-character cleaning
│       └── result.ts           ok()/fail() mutation result helpers
├── tests/app.test.ts           integration/security tests (Miniflare + Bun)
├── scripts/postbuild.mjs       strips source maps and dotfiles from dist
├── deploy.json                 Freebuff Sites deploy manifest
├── wrangler.jsonc              local Worker, D1, and R2 config
├── PROJECT_SPEC.md             product source of truth
├── README.md                   operator-facing overview
├── index.html                  Vite entry HTML
├── vite.config.ts              React + Cloudflare Vite plugins
├── tsconfig.json               browser/shared typecheck
└── tsconfig.worker.json        Worker/tests typecheck
```

Generated or ignored: `dist/`, `.wrangler/`, `node_modules/`,
`freebuff-sites-build/`, `.env*` (except `.env.example`).

## Coding conventions

- TypeScript `strict` is on. Avoid `any`; prefer `unknown` and narrow it.
- Formatting: 2-space indentation, single quotes, no semicolons, trailing
  commas, arrow functions, `type`-only imports where possible.
- Shared values live in `src/shared/`; do not duplicate limits, role names,
  prefixes, or donation kinds in the client and Worker.
- API DTOs use camelCase JSON. Database columns use snake_case. Map rows at the
  server boundary; never leak raw D1 rows.
- API errors are `{ "error": "..." }` with an explicit HTTP status. Validation
  failures are 400, auth 401, forbidden 403, missing 404, conflict 409, size 413,
  rate limit 429, setup 503.
- Validate request bodies with the existing `readObject(value, allowedKeys)`
  allowlist, then check each type and length against `src/shared/forum.ts` or
  `src/shared/donations.ts`. Unknown keys are rejected.
- Server mutations return `MutationResult` from `result.ts`; routes translate
  `ok`/`fail` into JSON and status codes.
- Client components are function components with local state and hooks. There
  is no router library: routes are parsed in `src/client/main.tsx`. Use `Link`
  from `ui.tsx` for navigation and `send()` from `api.ts` for writes.
- Every data view handles loading, failure, and empty states explicitly.
- CSS lives in `src/client/style.css`; class names are kebab-case; reuse
  `panel`, `button`, `chip`, and form classes. No Tailwind, CSS-in-JS, or
  external fonts. Inline style is only for data-driven CSS custom properties.
- Tests are integration-style: use the `read`, `write`, and `promote` helpers,
  unique handles/IDs, and the single Miniflare database in `tests/app.test.ts`.
  Add authorization and validation regressions, not just happy paths.

## Strict rules

1. **Server-side authorization only.** Every state-changing route calls
   `authorise(c, minimumRole?)`. Role checks come from `roles.ts`; a client
   claim, hidden button, or `viewer` object is never authorization.
2. **CSRF is enforced inside `authorise`.** Do not hand-roll or skip the
   same-origin check. Do not add a mutating GET. The local-preview exemption
   exists only for the no-auth demo and must not be extended to hosted origins.
3. **No IDOR.** Scope user data by the authenticated row id, or require the
   correct staff role for staff-wide data. Verify the target exists and belongs
   where the query expects it before reading or writing.
4. **No SQL string interpolation.** Bind every value with `.bind()`; interpolate
   only static table/column names from trusted literals.
5. **Audit every staff action.** New moderation/admin mutations call `logAudit`
   with actor, action, target, reason, and safe metadata. `audit_log` is
   append-only; never add UPDATE or DELETE routes for it.
6. **Migrations are append-only.** Never edit an applied migration. Add a new
   version, update `schema.ts` in the same change, and keep DDL and Drizzle
   definitions in step. Migrations run automatically on first request.
7. **Seeding is idempotent.** Seed-owned IDs use `seed:`/`th:`. Never delete real
   user content. A deployed database keeps its `seed:v1` marker, so copy changes
   need an explicit versioned seed update rather than a manual reseed.
8. **No raw user HTML or CSS.** TipTap HTML is sanitised in the browser with
   DOMPurify and again in the Worker with `rehype-sanitize`; editor styles are
   mapped to allowlisted `.tx-*`, `.fs-*`, and `.align-*` classes. Legacy
   Markdown rows still render through the sanitised Markdown path. `body` is
   derived plain text and `body_html` is canonical HTML.
   `dangerouslySetInnerHTML` is only for the client-sanitised `post.html`.
   In-post images must point at `/api/files/<uuid>`; external links get
   `rel="nofollow ugc noopener"` and `target="_blank"`.

   Poll/Embed inserts an external URL. Known video and poll providers render as
   descriptors; native in-app poll tables and voting are out of scope.
9. **Images only.** Accept JPEG, PNG, and WebP by magic bytes, enforce the
   shared size/dimension limits, strip metadata server-side, and never accept
   video uploads. Store under R2 through the existing `media` helpers.
10. **No secrets in the repository.** `.env.example` holds placeholders only;
    real values live in Sites → Secrets or an untracked local file. Never print,
    log, commit, or echo a secret, and never expose a server secret to Vite
    client code.
11. **Palette and accessibility.** Use the tokens `#121316`, `#1C1E22`,
    `#24272D`, `#2F333B`, `#E6E8EC`, `#9AA0AA`, accents `#E53935` and
    `#3B82F6`. Dark only, system fonts, visible focus states, labels, and
    `prefers-reduced-motion` support.
12. **Stay in scope.** Implement the requested milestone only. No unrequested
    features, routes, dependencies, refactors, analytics, or documentation.
13. **Verify before claiming done.** Run `bun run typecheck`, `bun test`, and
    `bun run build` after changes. Preserve `bun.lock`; do not upgrade
    dependencies to work around an unrelated failure.
14. **Deploy only when asked.** Preview deployment needs the user's request;
    production publication needs explicit authorization. Never run destructive
    or hard-to-undo git commands on your own.
15. **Do not regress the unauthenticated path.** Public reads must keep working
    without a session, and staff-only boards/media must stay invisible to
    guests and regular members.

## Commands

```sh
bun install          # only if dependencies are missing; bun.lock is authoritative
bun run dev          # Vite + Worker on 0.0.0.0:3000

bun run typecheck    # tsc --noEmit (client/shared) + tsc -p tsconfig.worker.json
bun test             # Miniflare integration tests
bun run build        # dist/client + dist/publiclens/index.js, then postbuild cleanup
```

## Deployment notes

- Freebuff Sites project: `a3ead2fc-9fa7-426d-af34-eb9a489d93dc`.
- Preview environment has D1 `DB`, R2 `FILES`, and `REALTIME` attached.
- Deploy the Worker with `deploy.json` and `dist/`; this is not a Next.js app,
  so `sites_prepare_next` does not apply.
- Database migrations run on the first request after a deploy; there is no
  separate migration command.
- Public registration protection uses Cloudflare Turnstile. The site key is
  public; the secret belongs in Sites → Secrets. Never bundle the secret.
