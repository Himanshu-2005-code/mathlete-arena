import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "The simple rules for playing Mathlete Arena.",
};

export default function TermsPage() {
  return (
    <section className="prose">
      <h1 data-kicker="Legal // terms">Terms</h1>
      <p className="lede">Mathlete Arena is free to play. By using it you agree to these few rules.</p>

      <h2>Play fair</h2>
      <ul>
        <li>Don&apos;t use scripts, bots or tools to answer questions or submit scores.</li>
        <li>Don&apos;t try to break, overload or get around the game&apos;s limits.</li>
        <li>Pick a username that isn&apos;t offensive or pretending to be someone else.</li>
      </ul>
      <p>We may remove scores or accounts that break these rules.</p>

      <h2>No guarantees</h2>
      <p>
        The game is a hobby project, provided as it is. It may be slow to wake up, change, or go offline, and
        leaderboards or ratings may occasionally be reset.
      </p>

      <h2>Your data</h2>
      <p>
        See the <Link href="/privacy">privacy page</Link> for what is stored. You can download or delete your data any
        time from your profile.
      </p>
      <p className="hint">Last updated 8 November 2026.</p>
    </section>
  );
}
