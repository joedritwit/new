import { Link } from './ui'

/**
 * Terms and the DMCA policy. The agent contact is an explicit placeholder until
 * the owner supplies a registered address; do not treat it as real.
 */
export function TermsPage() {
  return (
    <div className="legal-page">
      <header className="page-head">
        <p className="eyebrow">The rules</p>
        <h1>Terms of use</h1>
        <p className="lede">
          PublicLens is a public forum for First Amendment audit field reports,
          law and records resources, gear, and civil discussion. Using the site
          means accepting these terms.
        </p>
      </header>

      <section className="panel">
        <h2>Reading and accounts</h2>
        <p>
          Boards, threads, profiles, the FOIA library, and the donation page are
          readable without an account. Posting, reporting, and Supporters-only
          boards need Sign in with Freebuff; this site never stores a password.
          One person, one account: do not create accounts to evade a warning,
          mute, or removal.
        </p>
      </section>

      <section className="panel">
        <h2>What you post</h2>
        <p>
          You keep ownership of what you write and upload. By posting you grant
          the site operator a non-exclusive licence to store, format, and
          display it on PublicLens, including re-encoding images and rendering
          Markdown.
        </p>
        <p>Do not post:</p>
        <ul>
          <li>content that breaks the law, including threats and incitement;</li>
          <li>
            other people&rsquo;s private information — addresses, phone numbers,
            and SSNs are held for staff review instead of being published;
          </li>
          <li>harassment, spam, or automated posting;</li>
          <li>material you do not have the right to share.</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Moderation</h2>
        <p>
          Members can report a post once. Moderators can dismiss a report,
          remove a post, lock a thread, or issue a warning of 1–3 points; three
          active points mute an account for 24 hours, and warnings last 90 days.
          Staff actions are written to an append-only audit log. Moderators
          cannot act on reports they filed, reports about their own posts, or
          content written by other staff unless they are an admin.
        </p>
      </section>

      <section className="panel">
        <h2>Images and video</h2>
        <p>
          Uploads are limited to JPEG, PNG, and WebP. Every image is re-encoded
          in the browser and stripped of EXIF, XMP, ICC, and text metadata
          before it is stored; originals are never kept. Video is never
          uploaded — paste a link from an allowlisted provider instead.
        </p>
      </section>

      <section className="panel">
        <h2>Donations and Supporter status</h2>
        <p>
          Donations are voluntary and go directly to the operator through the
          payment methods listed on the donation page. There is no checkout or
          payment processor on this site and nothing is sold. Supporter status
          is granted manually after a payment is confirmed, and revoking it ends
          Supporter board access.
        </p>
      </section>

      <section className="panel">
        <h2>No legal advice</h2>
        <p>
          Posts and FOIA templates are information, not legal advice. Statutes
          and agency practice differ by jurisdiction and change over time;
          verify anything you rely on.
        </p>
      </section>

      <section className="panel">
        <h2>Availability and liability</h2>
        <p>
          The site is provided as-is, without warranties. Content may be
          removed, boards may change, and the site may be unavailable. To the
          extent the law allows, the operator is not liable for content posted
          by members or for decisions you make based on it.
        </p>
      </section>

      <section className="panel">
        <h2>Changes</h2>
        <p>
          These terms may change as the site does. Continuing to use PublicLens
          after a change means accepting the updated terms. Copyright
          complaints are handled under the <Link href="/dmca">DMCA policy</Link>.
        </p>
      </section>
    </div>
  )
}

export function DmcaPage() {
  return (
    <div className="legal-page">
      <header className="page-head">
        <p className="eyebrow">Copyright</p>
        <h1>DMCA policy</h1>
        <p className="lede">
          PublicLens responds to notices of claimed copyright infringement under
          17 U.S.C. § 512. Send notices to the designated agent below.
        </p>
      </header>

      <section className="panel">
        <h2>Designated agent</h2>
        <p className="legal-placeholder">
          <strong>Placeholder — not a real contact yet.</strong> These details
          must be replaced with the operator&rsquo;s registered DMCA agent
          before launch.
        </p>
        <ul className="legal-contact">
          <li>
            <span>Agent</span> [AGENT NAME]
          </li>
          <li>
            <span>Email</span> [dmca@example.com]
          </li>
          <li>
            <span>Postal</span> [STREET ADDRESS, CITY, STATE, ZIP]
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>Sending a takedown notice</h2>
        <p>
          A notice must be written and include all of the following, as required
          by 17 U.S.C. § 512(c)(3):
        </p>
        <ul>
          <li>a physical or electronic signature of the copyright owner or their agent;</li>
          <li>identification of the copyrighted work claimed to be infringed;</li>
          <li>
            identification of the material claimed to be infringing, with enough
            detail — such as the thread URL — for us to find it;
          </li>
          <li>your name, address, telephone number, and email address;</li>
          <li>
            a statement that you have a good-faith belief the use is not
            authorised by the owner, its agent, or the law;
          </li>
          <li>
            a statement, under penalty of perjury, that the notice is accurate
            and that you are the owner or authorised to act for the owner.
          </li>
        </ul>
        <p>
          Incomplete notices may be returned. Knowingly false claims can carry
          liability under 17 U.S.C. § 512(f).
        </p>
      </section>

      <section className="panel">
        <h2>Counter-notices</h2>
        <p>
          If your content was removed and you believe the removal was a mistake,
          send a counter-notice to the agent above with your signature,
          identification of the removed material and where it appeared, a
          statement under penalty of perjury that you have a good-faith belief
          the material was removed by mistake or misidentification, and your
          name, address, telephone number, and consent to the jurisdiction of
          the federal district court for your address. We may restore the
          material unless the original claimant files a court action.
        </p>
      </section>

      <section className="panel">
        <h2>Repeat infringement</h2>
        <p>
          Accounts that repeatedly post infringing material are removed. Staff
          removal decisions are recorded in the audit log.
        </p>
      </section>

      <section className="panel">
        <h2>Scope</h2>
        <p>
          This policy covers material hosted on PublicLens. It does not cover
          content reached through embedded or external links, which remains the
          responsibility of the site that hosts it. Nothing here is legal
          advice; see the <Link href="/terms">terms of use</Link>.
        </p>
      </section>
    </div>
  )
}
