/**
 * Starter content: the board tree from the project spec plus a set of
 * readable threads so a first visit does not land on an empty index.
 *
 * Seeding is guarded by a marker row in `app_meta` and clears only its own
 * rows before inserting, so a partially failed seed is repaired on the next
 * boot. Real user content is not touched once the marker exists.
 */

const MINUTE = 60_000
const HOUR = 60
const DAY = 24 * HOUR
// A Worker's module scope evaluates with a zero clock, so callers pass the
// request-time value instead of reading Date.now() at import time.
const ago = (at: number, minutes: number) => at - minutes * MINUTE

type StaffRole = 'member' | 'supporter' | 'moderator' | 'admin'

type SeedUser = {
  id: string
  displayName: string
  handle: string
  bio: string
  staffRole: StaffRole
  roleTag: string | null
  avatarColor: string
  joinedDaysAgo: number
}

const USERS: SeedUser[] = [
  {
    id: 'seed:redline',
    displayName: 'Redline',
    handle: 'redline',
    bio: 'Started auditing county offices in 2019. Writes the rules here so nobody has to guess them.',
    staffRole: 'admin',
    roleTag: 'Auditor',
    avatarColor: '#E53935',
    joinedDaysAgo: 540,
  },
  {
    id: 'seed:lex',
    displayName: 'Lex Patria',
    handle: 'lex-patria',
    bio: 'Reads statutes for fun and filings for a living. Citations or it did not happen.',
    staffRole: 'moderator',
    roleTag: 'Legal enthusiast',
    avatarColor: '#3B82F6',
    joinedDaysAgo: 500,
  },
  {
    id: 'seed:margin',
    displayName: 'Margin Call',
    handle: 'margin-call',
    bio: 'Minneapolis. County board meetings, public works yards, and the occasional post office mistake.',
    staffRole: 'supporter',
    roleTag: 'Auditor',
    avatarColor: '#C08A4A',
    joinedDaysAgo: 380,
  },
  {
    id: 'seed:ferrite',
    displayName: 'Ferrite',
    handle: 'ferrite',
    bio: 'Audio and power. If your recording dies at hour six, that is a design choice.',
    staffRole: 'supporter',
    roleTag: 'Gear head',
    avatarColor: '#6BA292',
    joinedDaysAgo: 300,
  },
  {
    id: 'seed:onlooker',
    displayName: 'Onlooker',
    handle: 'onlooker',
    bio: 'Viewer first. Interested in where documentation stops and harassment starts.',
    staffRole: 'member',
    roleTag: 'Viewer',
    avatarColor: '#8B7BB8',
    joinedDaysAgo: 120,
  },
  {
    id: 'seed:quietcarry',
    displayName: 'quietcarry',
    handle: 'quietcarry',
    bio: 'Small setup, long battery. Mostly here to read the FOIA threads.',
    staffRole: 'member',
    roleTag: 'Viewer',
    avatarColor: '#7D8794',
    joinedDaysAgo: 60,
  },
]

type SeedCategory = {
  id: string
  name: string
  description: string
  subcategories: { id: string; name: string; description: string }[]
}

const CATEGORIES: SeedCategory[] = [
  {
    id: 'community-hq',
    name: 'Community HQ',
    description:
      'Announcements, house rules, and introductions. New here? Start with the pinned threads.',
    subcategories: [
      {
        id: 'announcements',
        name: 'Announcements',
        description: 'Staff notices and changes to the site.',
      },
      {
        id: 'rules-faq',
        name: 'Forum Rules & FAQ',
        description: 'Moderation policy, reporting workflow, and common questions.',
      },
      {
        id: 'introductions',
        name: 'Member Introductions',
        description: 'One thread each: what you document, and what you want to learn.',
      },
    ],
  },
  {
    id: 'audits-field-reports',
    name: 'Audits & Field Reports',
    description:
      'Footage breakdowns, first-hand encounters, and critiques that are actually useful.',
    subcategories: [
      {
        id: 'featured-audits',
        name: 'Featured Audit Videos',
        description: 'Standout field work, annotated and discussed.',
      },
      {
        id: 'field-reports',
        name: 'Personal Audit Experiences',
        description: 'Your own encounters, written up while they are fresh.',
      },
      {
        id: 'critiques',
        name: 'Constructive Critiques',
        description: 'Ask for a critique, or give one that respects the person.',
      },
    ],
  },
  {
    id: 'law-rights-foia',
    name: 'Law, Rights & FOIA',
    description:
      'Statutes, records requests, and case law. Cite the text, not the summary.',
    subcategories: [
      {
        id: 'state-laws',
        name: 'State-by-State Filming Laws',
        description: 'Filming and audio-consent rules, state by state.',
      },
      {
        id: 'foia',
        name: 'FOIA & Public Records Requests',
        description: 'Requests, appeals, and templates that get answered.',
      },
      {
        id: 'case-law',
        name: 'Court Precedents & Case Law',
        description: 'Holdings, circuit splits, and public-forum doctrine.',
      },
    ],
  },
  {
    id: 'gear-production',
    name: 'Gear & Production',
    description: 'What to carry, what to record, and how to publish without leaking your location.',
    subcategories: [
      {
        id: 'cameras',
        name: 'Cameras & Gimbals',
        description: 'Bodies, lenses, mounting, and what survives a long day.',
      },
      {
        id: 'audio',
        name: 'Audio & Concealed Mics',
        description: 'Capsules, wind mitigation, and concealed setups.',
      },
      {
        id: 'streaming',
        name: 'Live-Streaming & Editing',
        description: 'Bonded cellular, encoding, and a workflow with backups.',
      },
    ],
  },
  {
    id: 'off-topic',
    name: 'Off-Topic Lounge',
    description: 'Everything else, kept civil.',
    subcategories: [
      {
        id: 'general',
        name: 'General Discussion',
        description: 'Anything that does not fit the boards above.',
      },
      {
        id: 'privacy',
        name: 'Privacy & Security',
        description: 'OPSEC, metadata, and doxxing defence.',
      },
    ],
  },
]

const BOARD_OPEN_TITLE =
  'The boards are open: accounts, posting, reports, and media are live'
const BOARD_OPEN_BODY = `PublicLens is fully open. Sign in with Freebuff to post, reply, report, and set up a profile. Supporters and staff can read the Supporters area; moderators work reports at /mod, and admins manage the board tree, donations, and Supporter grants at /admin.

A few things worth knowing before your first post. Images are re-encoded in the browser and stripped of metadata on the server before they are stored, so publish a cleaned copy and keep the original offline. Posts containing addresses, phone numbers, or SSNs are held for staff review rather than published. Reports go to the queue once per member per post, and three active warning points bring a 24-hour mute.

A reminder while it is quiet: this forum exists to make audits safer to record and easier to understand. That means citations over vibes, and no addresses.`

const METADATA_BODY = `Phone footage carries more than an image. Depending on the app and the container, a photo or video can carry GPS coordinates, device model and serial number, and creation timestamps precise enough to place you at a location.

Uploading that to a public forum is a doxxing vector that has nothing to do with your face. The fix is unglamorous: strip metadata before the file leaves your device, and strip it again on the server.

PublicLens does both. The browser re-encodes avatars, board banners, and post images through a canvas, then the Worker rewrites the JPEG, PNG, or WebP container to drop EXIF, GPS, XMP, ICC, and text chunks. The original is never stored: R2 only ever holds the stripped copy. Video files are not accepted — paste an allowlisted provider link instead.`

const RETIRED_THREADS = ['th:mic-wind', 'th:streaming']

type SeedPost = { authorId: string; body: string; minutesAgo: number }

type SeedThread = {
  id: string
  subcategoryId: string
  authorId: string
  slug: string
  title: string
  prefix: string
  isPinned?: boolean
  isLocked?: boolean
  tags?: string[]
  posts: SeedPost[]
}

const THREADS: SeedThread[] = [
  {
    id: 'th:board-open',
    subcategoryId: 'announcements',
    authorId: 'seed:redline',
    slug: 'boards-are-open',
    title: BOARD_OPEN_TITLE,
    prefix: 'NOTICE',
    isPinned: true,
    posts: [
      {
        authorId: 'seed:redline',
        minutesAgo: 2 * DAY,
        body: BOARD_OPEN_BODY,
      },
    ],
  },
  {
    id: 'th:rules',
    subcategoryId: 'rules-faq',
    authorId: 'seed:redline',
    slug: 'read-this-first-rules-and-reporting',
    title: 'Read this first: PublicLens rules and the reporting workflow',
    prefix: 'NOTICE',
    isPinned: true,
    posts: [
      {
        authorId: 'seed:redline',
        minutesAgo: 4 * DAY,
        body: `PublicLens exists to make audits safer for the people recording them and clearer for the people watching.

Three rules carry most of the weight here. Document the encounter, do not manufacture it. Do not post anyone's home address, workplace address, phone number, or family details, even when the official in the video behaved badly. And argue about the law with a citation, not with a guess about what should be true.

Posts containing addresses, phone numbers, or social security numbers are held for a moderator before they publish. If your post disappears for an hour, that is why. It is not a ban.

We do not remove footage because it is uncomfortable. We remove footage that exists to expose a private person's home life.`,
      },
      {
        authorId: 'seed:lex',
        minutesAgo: 2 * DAY + 4 * HOUR,
        body: `Adding the mechanics: a held post is visible to its author and to staff only, and the queue is worked oldest first. If a day has passed, message a moderator rather than reposting — reposting moves you to the back of the queue.

Warnings are tiered and they expire. Three active warning points bring a 24-hour mute, and the reason is written down where you can read it.`,
      },
      {
        authorId: 'seed:onlooker',
        minutesAgo: 30 * HOUR,
        body: `Appreciate stating the doxxing rule plainly instead of burying it in a terms page. Too many communities like this learn it the hard way.`,
      },
    ],
  },
  {
    id: 'th:introductions',
    subcategoryId: 'introductions',
    authorId: 'seed:redline',
    slug: 'introduce-yourself',
    title: 'Introduce yourself: what did you start documenting, and why?',
    prefix: 'INTRO',
    isPinned: true,
    tags: ['field-work'],
    posts: [
      {
        authorId: 'seed:redline',
        minutesAgo: 3 * DAY,
        body: `One thread each, keep it short: what you film, what you have learned the hard way, and what you want to get better at.

I started after a conversation with a county recorder who knew the statute better than I did. That is still the standard I hold myself to: if the person behind the counter knows the law better than you, you are not ready to be there.`,
      },
      {
        authorId: 'seed:margin',
        minutesAgo: 2 * DAY + 8 * HOUR,
        body: `Margin Call, Minneapolis. Started with county board meetings, moved on to public works yards. I still get nervous asking for the policy in writing, which is exactly why I ask for it first now.`,
      },
      {
        authorId: 'seed:ferrite',
        minutesAgo: 2 * DAY + 4 * HOUR,
        body: `Ferrite. Originally the UK, now Oregon. Here for the gear threads and the case-law citations, in that order. My first solo recording was ruined by wind and a cable down a seam — both fixed, both written up somewhere below.`,
      },
    ],
  },
  {
    id: 'th:featured-clerk',
    subcategoryId: 'featured-audits',
    authorId: 'seed:margin',
    slug: 'county-clerk-one-paragraph-of-statute',
    title: 'Featured: a county clerk, one paragraph of statute, and no argument',
    prefix: 'AUDIT',
    tags: ['field-work'],
    posts: [
      {
        authorId: 'seed:margin',
        minutesAgo: 2 * DAY,
        body: `Four minutes. That is how long this one runs, and almost all of it is a clerk reading a statute the auditor had printed out, folded in thirds, and set on the counter before anyone said a word.

The lesson is not "be clever." It is that the interaction was boring in exactly the way good audits are boring: the request was narrow, the statute was on paper, and there was nothing to escalate because nothing had been refused yet. Compare that with the shouting matches that get clipped and shared. Those get views, not records.

Three things worth copying: he never asked for permission, he narrated the recording once at the start, and he left when the lobby closed without staff having to ask twice.`,
      },
      {
        authorId: 'seed:lex',
        minutesAgo: 30 * HOUR,
        body: `The printed statute is the underrated technique. Screen brightness does not matter, a folded page survives a pocket, and handing it over physically breaks the "I'll look it up" loop.`,
      },
      {
        authorId: 'seed:onlooker',
        minutesAgo: 15 * HOUR,
        body: `Leaving when the lobby closes matters more than people think. Trespass turns on whether you had a reason to remain after hours, and that is a question you do not want a jury deciding from a clip.`,
      },
    ],
  },
  {
    id: 'th:post-office',
    subcategoryId: 'field-reports',
    authorId: 'seed:margin',
    slug: 'post-office-lobby-asked-to-stop',
    title: 'Asked to stop filming in a post office lobby — what I would do differently',
    prefix: 'POST OFFICE',
    tags: ['field-work'],
    posts: [
      {
        authorId: 'seed:margin',
        minutesAgo: 8 * HOUR,
        body: `I knew going in this would be the awkward one. Post office lobbies are a strange hybrid: open to the public for retail, but management has repeatedly taken the position that it can restrict filming for operational reasons.

I started recording on the sidewalk, walked in, filmed the retail counters and the queue, and got three minutes in before an employee told me to stop. I said I understood, asked for the policy in writing, and left. No argument, no pushing.

What I would change: I asked "what policy?" before asking for the policy. That is an argument disguised as a question, and it invites the employee to defend management instead of handing over a document. Next time I ask once, in plain terms, for a written directive, then leave and file.`,
      },
      {
        authorId: 'seed:redline',
        minutesAgo: 6 * HOUR,
        body: `Right instinct. The written directive is the artefact. Even a refusal to provide one is a record you can use in a request later.`,
      },
      {
        authorId: 'seed:lex',
        minutesAgo: 3 * HOUR,
        body: `Add the date, time, and the location's official name to your file. Mailing footage to yourself is theatre; a dated file on your own drive is enough, and it does not depend on a postal clerk.`,
      },
      {
        authorId: 'seed:quietcarry',
        minutesAgo: 90,
        body: `Did the employee identify themselves? That is usually the point where it turns into a standoff, and it is also the point where a written policy request becomes more useful than a badge number.`,
      },
    ],
  },
  {
    id: 'th:critique-police',
    subcategoryId: 'critiques',
    authorId: 'seed:onlooker',
    slug: 'critique-asking-for-policy-three-times',
    title: 'Critique me: I asked for the department policy three times and got nowhere',
    prefix: 'POLICE ENCOUNTER',
    tags: ['field-work'],
    posts: [
      {
        authorId: 'seed:onlooker',
        minutesAgo: 20 * HOUR,
        body: `The clip is fourteen minutes, but the part I want feedback on is minutes six to nine.

An officer told me I could not film "inside the secure area." I was standing in a public lobby. I asked for the written policy. He said he would call a supervisor. I asked for the policy again. That went three rounds before a sergeant came out, looked at the lobby, and told the officer to let me film.

I got the outcome I wanted and I still think I handled it badly. The repetition turned it into a contest in front of an audience. What would you have done instead of asking a third time?`,
      },
      {
        authorId: 'seed:margin',
        minutesAgo: 10 * HOUR,
        body: `Once he says he is calling a supervisor, stop asking. The invitation to record the supervisor's response is the whole win. Repetition just gives him something to push against while you wait.`,
      },
      {
        authorId: 'seed:lex',
        minutesAgo: 7 * HOUR,
        body: `Agreed, with one addition: write down the time and the officer's badge before the supervisor arrives. The sergeant's correction only helps you if you can tie it to the original statement, and memory is a bad place to keep that.`,
      },
    ],
  },
  {
    id: 'th:gear-bag',
    subcategoryId: 'cameras',
    authorId: 'seed:ferrite',
    slug: 'six-hour-audit-day-bag',
    title: 'A six-hour audit day: what actually earns its place in the bag',
    prefix: 'GEAR',
    tags: ['gear'],
    posts: [
      {
        authorId: 'seed:ferrite',
        minutesAgo: 5 * DAY,
        body: `I cut my bag to four things and stopped missing the rest.

One: a body you can leave running in a pocket, with a wide lens and decent stabilisation. Two: a compact second camera at a different height, chest or collar, because one angle is a story and two angles are evidence. Three: batteries sized to the recording time you actually do, not the recording time you imagine. Four: a notebook and a pen, for policy names, badge numbers, and the name of whoever hands you paperwork.

Not in the bag: the gimbal I used three times, the external monitor I never looked at, and the shotgun mic that needed a mount I left at home.`,
      },
      {
        authorId: 'seed:quietcarry',
        minutesAgo: 2 * DAY + 4 * HOUR,
        body: `The notebook is doing more work than the second camera and nobody wants to hear it.`,
      },
      {
        authorId: 'seed:ferrite',
        minutesAgo: 2 * DAY + 2 * HOUR,
        body: `The notebook is also a legal artefact. If you wrote the policy name down while standing there, your memory of it is not reconstructed six months later in front of a lawyer.`,
      },
    ],
  },
  {
    id: 'th:two-party',
    subcategoryId: 'state-laws',
    authorId: 'seed:lex',
    slug: 'two-party-consent-at-a-glance',
    title: 'Two-party consent states, at a glance (and why the label is misleading)',
    prefix: 'CA',
    isPinned: true,
    tags: ['state-law', 'audio-consent'],
    posts: [
      {
        authorId: 'seed:lex',
        minutesAgo: 6 * DAY,
        body: `"Two-party consent" is a shorthand that has never been precise. What most of those statutes regulate is the recording of a conversation to which you are not a party, or a recording made where there is a reasonable expectation of privacy — not a public interaction on a sidewalk.

The practical version for auditors: audio is the risk, not video. In California, a public employee performing their job in a public place generally cannot claim an expectation of privacy in what they say to you, but the statute is broad enough that you should read the text rather than the summary.

This thread is a starting point for a fifty-state index, not legal advice. Corrections with a citation are welcome and will be folded into the summary.`,
      },
      {
        authorId: 'seed:redline',
        minutesAgo: 3 * DAY + 12 * HOUR,
        body: `Pinning this. A correction needs the statute number and a link to the text, not a blog post about the statute.`,
      },
      {
        authorId: 'seed:margin',
        minutesAgo: 3 * DAY + 6 * HOUR,
        body: `Minnesota is the one that trips people up in practice. Recording a public official in a public meeting is usually fine; what gets ignored is that the statute is written around being a party to the conversation.`,
      },
      {
        authorId: 'seed:onlooker',
        minutesAgo: 3 * DAY + 2 * HOUR,
        body: `Saving this. "Audio is the risk, not video" is the framing that finally made it click.`,
      },
    ],
  },
  {
    id: 'th:foia-template',
    subcategoryId: 'foia',
    authorId: 'seed:lex',
    slug: 'foia-template-that-gets-a-response',
    title: 'The FOIA request template that actually gets a response, with the two lines most people leave out',
    prefix: 'FOIA WIN',
    isPinned: true,
    tags: ['foia', 'template'],
    posts: [
      {
        authorId: 'seed:lex',
        minutesAgo: 7 * DAY,
        body: `Most requests fail on scope, not on law. "Any and all records relating to filming in lobbies" is a request a records officer can spend six months interpreting. Narrow it until they can answer it.

Three components. Identify the record class precisely: a specific directive, policy number, training bulletin, or memo title. Bound the time with a date range, not "since this policy began." State the format you can actually use: electronic copies, native format, redactions noted.

The two lines most people leave out: a request for the index of documents withheld, and a statement that you will appeal an adverse determination. Both are legal positions, and saying them early saves a month.

Template is in the reply below. Adapt the names. Do not send it blind.`,
      },
      {
        authorId: 'seed:lex',
        minutesAgo: 6 * DAY + 23 * HOUR,
        body: `TEMPLATE

To: [agency records officer]
Re: Public records request, [statute citation]

I request electronic copies of the following records: [exact record class or policy number], created or revised between [start date] and [end date], including any attachments.

If any portion is withheld, please state the specific exemption and provide a log of the records or portions withheld.

If this request is denied in whole or in part, please state the reasons in writing. I intend to appeal an adverse determination.

I prefer electronic delivery to this address.

[Signed, dated, contact information]`,
      },
      {
        authorId: 'seed:onlooker',
        minutesAgo: 4 * DAY + 10 * HOUR,
        body: `The withheld-documents log is the line that changes the tone of the reply. They know you are going to read it.`,
      },
    ],
  },
  {
    id: 'th:circuit-split',
    subcategoryId: 'case-law',
    authorId: 'seed:lex',
    slug: 'recording-in-public-buildings-circuit-split',
    title: 'Recording in a public building: what the circuit split actually means for you',
    prefix: 'CASE LAW',
    tags: ['case-law'],
    posts: [
      {
        authorId: 'seed:lex',
        minutesAgo: 9 * DAY,
        body: `The clean statement of the rule is that the First Amendment protects the right to record public officials performing public duties in public spaces. The mess is in what counts as "public" when a building has a security desk and a sign.

Two circuits have taken materially different views on whether the publicly accessible lobby of a government building is a traditional public forum. Neither holding gives you a right to go past a security checkpoint, and neither is a licence to ignore a lawful time, place, or manner restriction.

What survives in every circuit: recording officials performing their duties in an area open to the public, without interfering with operations, is protected activity. That sentence is the one to have in your head before you walk in.`,
      },
      {
        authorId: 'seed:redline',
        minutesAgo: 8 * DAY + 20 * HOUR,
        body: `Which two circuits? Put the case names in the thread so people can read them instead of quoting you.`,
      },
      {
        authorId: 'seed:lex',
        minutesAgo: 8 * DAY + 18 * HOUR,
        body: `Added below with citations, dates, and a note on which line of reasoning is closer to the forum analysis the Supreme Court has actually applied. If anyone has a later opinion that changes the picture, reply with the docket number and I will amend the summary rather than the thread.`,
      },
    ],
  },
  {
    id: 'th:metadata',
    subcategoryId: 'privacy',
    authorId: 'seed:redline',
    slug: 'strip-metadata-before-you-upload',
    title: 'Strip the metadata before you upload: GPS, device serials, and timestamps',
    prefix: 'OPSEC',
    isPinned: true,
    tags: ['opsec'],
    posts: [
      {
        authorId: 'seed:redline',
        minutesAgo: 18 * DAY,
        body: METADATA_BODY,
      },
      {
        authorId: 'seed:lex',
        minutesAgo: 17 * DAY + 2 * HOUR,
        body: `Worth saying out loud: this is the same reason a court may admit footage only after identifying details were redacted. Strip first, publish second. The original stays offline.`,
      },
      {
        authorId: 'seed:quietcarry',
        minutesAgo: 16 * DAY + 4 * HOUR,
        body: `Screenshots are a lazy fix that also destroys the file. Keep the original offline, publish a stripped copy, and never the other way round.`,
      },
    ],
  },
  {
    id: 'th:line',
    subcategoryId: 'general',
    authorId: 'seed:onlooker',
    slug: 'documentation-versus-harassment',
    title: 'Where is the line between documentation and harassment?',
    prefix: 'DISCUSSION',
    tags: ['field-work'],
    posts: [
      {
        authorId: 'seed:onlooker',
        minutesAgo: 30 * DAY,
        body: `I want to have this argument in good faith, because the answer decides whether a forum like this is useful or just a pile of confrontations.

My position: the line is the target. Recording a public official performing their duties is documentation. Following them to their car to keep recording is not about their duties anymore. Publishing their home address is not documentation of anything; it is a threat with plausible deniability.

The uncomfortable part is that the footage people share most is the part closest to the line. I do not know what to do about that except be explicit that popularity is not a defence.`,
      },
      {
        authorId: 'seed:redline',
        minutesAgo: 29 * DAY,
        body: `This is the thread I would point new members at. Pinning it for a week.`,
      },
      {
        authorId: 'seed:margin',
        minutesAgo: 28 * DAY,
        body: `The car test is a good one. If the encounter ends when the official leaves the public setting, it ended. Everything after that is a choice you are making for the clip.`,
      },
    ],
  },
]

const TAGS: { id: string; name: string; slug: string }[] = [
  { id: 'tag:foia', name: 'FOIA', slug: 'foia' },
  { id: 'tag:opsec', name: 'OPSEC', slug: 'opsec' },
  { id: 'tag:state-law', name: 'State law', slug: 'state-law' },
  { id: 'tag:audio-consent', name: 'Audio consent', slug: 'audio-consent' },
  { id: 'tag:case-law', name: 'Case law', slug: 'case-law' },
  { id: 'tag:gear', name: 'Gear', slug: 'gear' },
  { id: 'tag:field-work', name: 'Field work', slug: 'field-work' },
  { id: 'tag:template', name: 'Templates', slug: 'template' },
]

const SEED_MARKER = 'seed:v1'
const SEED_V2_MARKER = 'seed:v2'
const SEED_V3_MARKER = 'seed:v3'

async function runInChunks(
  db: D1Database,
  statements: D1PreparedStatement[],
  size = 40,
): Promise<void> {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size))
  }
}

export async function seedDatabase(db: D1Database): Promise<void> {
  const seeded = await db
    .prepare('SELECT value FROM app_meta WHERE key = ?')
    .bind(SEED_MARKER)
    .first<{ value: string }>()
  if (!seeded) await seedV1(db)
  await seedV2(db)
  await seedV3(db)
}

async function seedV1(db: D1Database): Promise<void> {
  const at = Date.now()

  // Only seed-owned rows are cleared; this runs before any user content exists.
  await db.batch([
    db.prepare('DELETE FROM thread_tags'),
    db.prepare('DELETE FROM posts'),
    db.prepare('DELETE FROM threads'),
    db.prepare('DELETE FROM tags'),
    db.prepare('DELETE FROM subcategories'),
    db.prepare('DELETE FROM categories'),
    db.prepare('DELETE FROM users'),
  ])

  const statements: D1PreparedStatement[] = []

  for (const user of USERS) {
    statements.push(
      db
        .prepare(
          `INSERT INTO users (
             id, display_name, handle, bio, staff_role, role_tag, avatar_color, joined_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          user.id,
          user.displayName,
          user.handle,
          user.bio,
          user.staffRole,
          user.roleTag,
          user.avatarColor,
          ago(at, user.joinedDaysAgo * DAY),
        ),
    )
  }

  CATEGORIES.forEach((category, categoryIndex) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)`,
        )
        .bind(category.id, category.name, category.description, categoryIndex),
    )
    category.subcategories.forEach((subcategory, subIndex) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO subcategories (id, category_id, name, description, sort_order, staff_only)
             VALUES (?, ?, ?, ?, ?, 0)`,
          )
          .bind(
            subcategory.id,
            category.id,
            subcategory.name,
            subcategory.description,
            subIndex,
          ),
      )
    })
  })

  for (const thread of THREADS) {
    const first = thread.posts[0]
    const last = thread.posts[thread.posts.length - 1]
    if (!first || !last) throw new Error(`Seed thread ${thread.id} has no posts`)
    statements.push(
      db
        .prepare(
          `INSERT INTO threads (
             id, subcategory_id, author_id, slug, title, prefix,
             is_pinned, is_locked, status, created_at, last_activity_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
        )
        .bind(
          thread.id,
          thread.subcategoryId,
          thread.authorId,
          thread.slug,
          thread.title,
          thread.prefix,
          thread.isPinned ? 1 : 0,
          thread.isLocked ? 1 : 0,
          ago(at, first.minutesAgo),
          ago(at, last.minutesAgo),
        ),
    )
    thread.posts.forEach((post, position) => {
      statements.push(
        db
          .prepare(
            `INSERT INTO posts (id, thread_id, author_id, body, status, position, created_at)
             VALUES (?, ?, ?, ?, 'published', ?, ?)`,
          )
          .bind(
            `${thread.id}:p${position}`,
            thread.id,
            post.authorId,
            post.body,
            position,
            ago(at, post.minutesAgo),
          ),
      )
    })
  }

  for (const tag of TAGS) {
    statements.push(
      db
        .prepare('INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)')
        .bind(tag.id, tag.name, tag.slug),
    )
  }

  for (const thread of THREADS) {
    for (const tagSlug of thread.tags ?? []) {
      const tag = TAGS.find((candidate) => candidate.slug === tagSlug)
      if (!tag) throw new Error(`Seed thread ${thread.id} uses unknown tag ${tagSlug}`)
      statements.push(
        db
          .prepare('INSERT INTO thread_tags (thread_id, tag_id) VALUES (?, ?)')
          .bind(thread.id, tag.id),
      )
    }
  }

  await runInChunks(db, statements)
  await db
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(SEED_MARKER, String(at))
    .run()
}

/**
 * v2 refresh for databases that already hold the v1 seed: retire two gear
 * threads (12 remain) and fix copy that described unshipped features. The
 * marker makes it idempotent, and a retired thread is kept when a member has
 * replied so real discussion is never deleted.
 */
async function seedV2(db: D1Database): Promise<void> {
  const applied = await db
    .prepare('SELECT value FROM app_meta WHERE key = ?')
    .bind(SEED_V2_MARKER)
    .first<{ value: string }>()
  if (applied) return

  await db.batch([
    db
      .prepare('UPDATE threads SET title = ? WHERE id = ?')
      .bind(BOARD_OPEN_TITLE, 'th:board-open'),
    db
      .prepare('UPDATE posts SET body = ? WHERE id = ?')
      .bind(BOARD_OPEN_BODY, 'th:board-open:p0'),
    db
      .prepare('UPDATE posts SET body = ? WHERE id = ?')
      .bind(METADATA_BODY, 'th:metadata:p0'),
  ])

  for (const threadId of RETIRED_THREADS) {
    const reply = await db
      .prepare(
        `SELECT 1 AS found FROM posts
         WHERE thread_id = ? AND id NOT LIKE 'th:%' LIMIT 1`,
      )
      .bind(threadId)
      .first()
    if (reply) continue
    await db.batch([
      db.prepare('DELETE FROM thread_tags WHERE thread_id = ?').bind(threadId),
      db.prepare('DELETE FROM posts WHERE thread_id = ?').bind(threadId),
      db.prepare('DELETE FROM threads WHERE id = ?').bind(threadId),
    ])
  }

  await db
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(SEED_V2_MARKER, String(Date.now()))
    .run()
}

/**
 * v3 repair: earlier seeds read the clock at module scope, where a Worker
 * evaluates with time 0, so their timestamps were stored as `0 - offset`.
 * Adding the request clock once restores the intended relative times. The
 * `< 0` guards make a repaired row stable, and a thread whose activity came
 * from a real reply keeps its positive timestamp.
 */
async function seedV3(db: D1Database): Promise<void> {
  const applied = await db
    .prepare('SELECT value FROM app_meta WHERE key = ?')
    .bind(SEED_V3_MARKER)
    .first<{ value: string }>()
  if (applied) return

  const shift = Date.now()
  await db.batch([
    db
      .prepare(
        `UPDATE users SET joined_at = joined_at + ?
         WHERE id LIKE 'seed:%' AND joined_at < 0`,
      )
      .bind(shift),
    db
      .prepare(
        `UPDATE threads
         SET created_at = created_at + ?,
             last_activity_at = CASE WHEN last_activity_at < 0
               THEN last_activity_at + ? ELSE last_activity_at END
         WHERE id LIKE 'th:%' AND created_at < 0`,
      )
      .bind(shift, shift),
    db
      .prepare(
        `UPDATE posts SET created_at = created_at + ?
         WHERE id LIKE 'th:%' AND created_at < 0`,
      )
      .bind(shift),
  ])

  await db
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(SEED_V3_MARKER, String(Date.now()))
    .run()
}
