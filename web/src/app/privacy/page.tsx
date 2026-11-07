import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Mathlete Arena stores about players, and what it doesn't.",
};

export default function PrivacyPage() {
  return (
    <section className="prose">
      <h1 data-kicker="Legal // privacy">Privacy</h1>
      <p className="lede">Mathlete Arena is a small mental-math game. It keeps as little about you as it can.</p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account:</strong> a username, and a hashed password if you set one (we never see or store the
          password itself).
        </li>
        <li>
          <strong>If you sign in with Google:</strong> Google&apos;s anonymous ID for your account, so we can recognise
          you next time. We read your name once to suggest a username. We don&apos;t store your email address, photo or
          anything else from Google.
        </li>
        <li>
          <strong>Your games:</strong> scores, solve times, duel results, rating and daily streak. These appear on
          leaderboards and your public player page next to your username.
        </li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>No ads, no tracking scripts, and no selling or sharing of your data.</li>
        <li>No cookies for tracking. Your login and settings (theme, sound) are kept in your own browser.</li>
      </ul>

      <h2>Where it lives</h2>
      <p>
        The game runs on Render and stores its data in a Turso database in the United States. Server logs record which
        pages were requested and when, not who you are.
      </p>

      <h2>Your choices</h2>
      <p>
        From your <Link href="/profile">profile</Link> you can download everything stored about you, or delete your
        account and all of its results permanently.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Open an issue on the game&apos;s{" "}
        <a href="https://github.com/Himanshu-2005-code/mathlete-arena">GitHub page</a>.
      </p>
      <p className="hint">Last updated 8 November 2026.</p>
    </section>
  );
}
