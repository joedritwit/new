/**
 * FOIA and public-records templates. They are plain text on purpose: a
 * download or copy needs no binary storage, no R2 object, and no dependency.
 * Placeholders are bracketed so they survive a copy into a word processor.
 */

export type FoiaJurisdiction = 'Federal' | 'State' | 'Local'

export type FoiaTemplate = {
  id: string
  title: string
  jurisdiction: FoiaJurisdiction
  summary: string
  body: string
}

const FEDERAL_HEADER = `[YOUR NAME]
[YOUR ADDRESS]
[YOUR EMAIL]
[DATE]

VIA EMAIL AND CERTIFIED MAIL

FOIA Officer
[AGENCY NAME]
[AGENCY ADDRESS]

RE: Freedom of Information Act Request — [SUBJECT]`

export const FOIA_TEMPLATES: FoiaTemplate[] = [
  {
    id: 'federal-records-request',
    title: 'Federal FOIA request',
    jurisdiction: 'Federal',
    summary:
      'A clean opening request under 5 U.S.C. § 552 with a defined scope, format, and fee limit.',
    body: `${FEDERAL_HEADER}

Dear FOIA Officer:

Pursuant to the Freedom of Information Act, 5 U.S.C. § 552, I request copies of the following records:

1. All records concerning [SUBJECT / INCIDENT].
2. All policies, training materials, and directives governing [POLICY AREA].
3. All communications between [OFFICE A] and [OFFICE B] regarding [SUBJECT] from [DATE RANGE].

Please search all agency components likely to hold responsive records, including [OFFICE / FIELD OFFICE / COMPONENT].

I request records in electronic format where available. If a record exists in multiple formats, I prefer the native electronic format with metadata intact.

I am willing to pay reasonable duplication fees up to $[AMOUNT]. Please notify me before incurring any fees above that amount.

If you withhold any record or portion of a record, please cite the specific statutory exemption and release all reasonably segregable non-exempt material.

Please provide an estimated date of completion and a tracking number.

Sincerely,
[YOUR NAME]
[PHONE NUMBER]`,
  },
  {
    id: 'federal-appeal',
    title: 'Federal FOIA appeal',
    jurisdiction: 'Federal',
    summary:
      'Appeal a denial, a partial release, an inadequate search, or a missing response.',
    body: `[YOUR NAME]
[YOUR ADDRESS]
[YOUR EMAIL]
[DATE]

VIA EMAIL AND CERTIFIED MAIL

FOIA Appeal Officer
[AGENCY NAME]
[AGENCY ADDRESS]

RE: Appeal of FOIA Request No. [TRACKING NUMBER]

Dear Appeal Officer:

I appeal the agency's [denial / partial denial / inadequate search / constructive denial] dated [DATE] concerning my request for [SUBJECT].

The agency [withheld records under Exemption (b)(__) / failed to search ___ / did not respond within the statutory period]. That action is inconsistent with the FOIA because:

1. [REASON ONE — e.g., the records are not covered by the cited exemption].
2. [REASON TWO — e.g., the search was limited to one office despite records being held elsewhere].
3. [REASON THREE — e.g., the agency did not release reasonably segregable material].

I request that the agency conduct a new search, release all non-exempt records, and provide the requested records in electronic format.

If the appeal is denied in whole or in part, please provide the written notice required by 5 U.S.C. § 552(a)(6)(A)(ii).

Sincerely,
[YOUR NAME]
[PHONE NUMBER]`,
  },
  {
    id: 'fee-waiver',
    title: 'FOIA fee waiver request',
    jurisdiction: 'Federal',
    summary:
      'Ask for a public-interest fee waiver when the records inform the public about government operations.',
    body: `${FEDERAL_HEADER}

Dear FOIA Officer:

Pursuant to 5 U.S.C. § 552(a)(4)(A)(iii), I request a waiver of all search and duplication fees.

Disclosure is in the public interest because it is likely to contribute significantly to public understanding of the operations or activities of the government and is not primarily in my commercial interest. Specifically:

1. The records concern [GOVERNMENT OPERATIONS / ACCOUNTABILITY ISSUE].
2. I intend to [PUBLISH / BROADCAST / SHARE] the records with the public through [OUTLET / FORUM].
3. The records will be used to [EXPLAIN / DOCUMENT / ANALYZE] government conduct, not for commercial resale.
4. I have the ability to disseminate the information widely because [EXPLAIN].

If the full waiver is not granted, I request a partial waiver and a breakdown of any fees before they are incurred.

Sincerely,
[YOUR NAME]`,
  },
  {
    id: 'expedited-processing',
    title: 'Expedited processing request',
    jurisdiction: 'Federal',
    summary:
      'Request priority handling where there is an urgency to inform the public or an imminent threat to life or safety.',
    body: `${FEDERAL_HEADER}

Dear FOIA Officer:

Pursuant to 5 U.S.C. § 552(a)(6)(E)(v), I request expedited processing of this request.

There is an urgent need to inform the public about an actual or alleged government activity concerning [ISSUE]. The records are needed before [DATE / EVENT] because [EXPLAIN THE URGENCY — ongoing policy, scheduled vote, imminent enforcement, etc.].

[ALTERNATIVE: There is an imminent threat to the life or physical safety of an individual because ___.]

I certify that the statements above are true and correct to the best of my knowledge.

Please decide whether to grant expedited processing within 10 calendar days and notify me of the decision.

Sincerely,
[YOUR NAME]`,
  },
  {
    id: 'state-public-records',
    title: 'State public-records request',
    jurisdiction: 'State',
    summary:
      'A generic state open-records request. Replace the citation with your state statute.',
    body: `[YOUR NAME]
[YOUR ADDRESS]
[YOUR EMAIL]
[DATE]

Records Custodian
[AGENCY NAME]
[AGENCY ADDRESS]

RE: Public Records Request — [SUBJECT]

Dear Records Custodian:

Pursuant to [YOUR STATE PUBLIC RECORDS STATUTE, e.g., Tex. Gov't Code § 552.001 et seq.], I request copies of the following records:

1. All records concerning [SUBJECT / INCIDENT].
2. All policies and training materials governing [POLICY AREA].
3. All communications regarding [SUBJECT] between [DATE RANGE].

I request the records in electronic format. If your agency maintains them in a searchable database, please provide the data in a structured export.

If any record is withheld, please cite the specific exemption and release all segregable non-exempt portions. Please provide a written estimate before any fees exceed $[AMOUNT].

Thank you for your assistance. Please confirm receipt and provide a tracking number.

Sincerely,
[YOUR NAME]
[PHONE NUMBER]`,
  },
  {
    id: 'body-camera-footage',
    title: 'Body-worn camera footage request',
    jurisdiction: 'Local',
    summary:
      'Request BWC footage, metadata, and the retention policy that governs it.',
    body: `[YOUR NAME]
[YOUR ADDRESS]
[YOUR EMAIL]
[DATE]

Records Custodian
[POLICE DEPARTMENT]
[ADDRESS]

RE: Public Records Request — Body-Worn Camera Footage, Incident [CASE / CAD NUMBER]

Dear Records Custodian:

I request copies of the following records concerning the incident on [DATE] at [LOCATION]:

1. All body-worn camera video, including front and rear camera files, for all officers present.
2. The associated metadata, including activation time, duration, officer identifier, and audit trail.
3. All incident reports, CAD notes, and dispatch audio.
4. The department's policy on activating, deactivating, and retaining body-worn camera recordings.

I request the native video files rather than screen recordings. If redaction is required, please release the unredacted portions and identify each redaction and its legal basis.

Please provide an estimate before fees exceed $[AMOUNT]. If the footage has been deleted, please provide the deletion record and the retention schedule in effect at the time.

Sincerely,
[YOUR NAME]
[PHONE NUMBER]`,
  },
  {
    id: 'incident-cad-records',
    title: 'Incident report and CAD records',
    jurisdiction: 'Local',
    summary:
      'Request the paper trail behind an encounter: reports, CAD logs, radio traffic, and use-of-force forms.',
    body: `[YOUR NAME]
[YOUR ADDRESS]
[YOUR EMAIL]
[DATE]

Records Custodian
[AGENCY NAME]
[ADDRESS]

RE: Public Records Request — Incident [CASE NUMBER]

Dear Records Custodian:

I request copies of the following records relating to the incident on [DATE] at [LOCATION]:

1. All incident and supplemental reports.
2. Computer-aided dispatch (CAD) logs and unit history for [TIME WINDOW].
3. Radio traffic recordings and transcripts for the responding units.
4. All use-of-force, stop, citation, and arrest forms.
5. All communications about the incident between [AGENCY] and [OTHER AGENCY].

I request electronic copies and the native file formats. If any record is withheld, please cite the exemption and release segregable portions.

Please confirm receipt and provide an estimate before fees exceed $[AMOUNT].

Sincerely,
[YOUR NAME]
[PHONE NUMBER]`,
  },
  {
    id: 'meeting-minutes-agenda',
    title: 'Meeting records and minutes',
    jurisdiction: 'Local',
    summary:
      'Request agendas, packets, minutes, recordings, and executive-session records for a public meeting.',
    body: `[YOUR NAME]
[YOUR ADDRESS]
[YOUR EMAIL]
[DATE]

Records Custodian
[BODY NAME]
[ADDRESS]

RE: Public Records Request — Meeting of [DATE]

Dear Records Custodian:

I request copies of the following records for the meeting held on [DATE]:

1. The agenda, agenda packet, and all supplemental materials provided to members.
2. The approved or draft minutes.
3. The audio or video recording of the open session.
4. All records of the executive session, including the statutory basis cited and the vote to enter it.
5. All communications between board members and staff regarding [AGENDA ITEM] from [DATE RANGE].

I request electronic copies. If any record is withheld, please cite the specific exemption and release all reasonably segregable material.

Sincerely,
[YOUR NAME]
[PHONE NUMBER]`,
  },
  {
    id: 'retention-hold',
    title: 'Records retention and deletion inquiry',
    jurisdiction: 'Local',
    summary:
      'Ask what was deleted, when, under which schedule, and who approved the deletion.',
    body: `[YOUR NAME]
[YOUR ADDRESS]
[YOUR EMAIL]
[DATE]

Records Custodian
[AGENCY NAME]
[ADDRESS]

RE: Records Retention Inquiry — [SUBJECT / CASE NUMBER]

Dear Records Custodian:

I request copies of the following records concerning the retention and destruction of records related to [SUBJECT]:

1. The retention schedule(s) applicable to [RECORD TYPE].
2. All destruction certificates, deletion logs, or disposition records for [DATE RANGE].
3. All communications about the deletion, loss, or overwriting of the records.
4. The name and title of the person who approved each disposition.
5. Any litigation hold, preservation request, or audit concerning the records.

If responsive records were destroyed, please state the date, the authority for destruction, and whether the destruction was suspended after any preservation request.

Sincerely,
[YOUR NAME]
[PHONE NUMBER]`,
  },
]

export const FOIA_DISCLAIMER =
  'These templates are starting points, not legal advice. Verify your state statute, deadlines, and fee rules before sending.'
