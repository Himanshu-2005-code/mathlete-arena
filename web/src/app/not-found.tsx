import Link from "next/link";

export default function NotFound() {
  return (
    <section className="results">
      <p className="hero-q play-q" aria-hidden>
        <span>404</span>
        <span className="eq">≠</span>
        <span className="muted">?</span>
      </p>
      <h1>This page doesn't add up.</h1>
      <p className="lede">There's nothing at this address. It may have moved, or the link has a typo.</p>
      <div className="actions">
        <Link href="/" className="btn">
          Go home
        </Link>
        <Link href="/duel" className="btn ghost">
          Find a duel
        </Link>
      </div>
    </section>
  );
}
