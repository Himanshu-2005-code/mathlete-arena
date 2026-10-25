/**
 * Placeholder blocks with a shimmer while data loads. `label` is read out to
 * screen readers in place of the shapes.
 */
export function Skeleton({ label, variant = "page" }: { label: string; variant?: "page" | "table" }) {
  return (
    <div className={`skeleton skeleton-${variant}`} role="status" aria-label={label}>
      {variant === "page" && (
        <>
          <span className="sk sk-kicker" />
          <span className="sk sk-title" />
          <span className="sk sk-line" />
          <span className="sk sk-line short" />
          <div className="sk-cards">
            <span className="sk sk-card" />
            <span className="sk sk-card" />
            <span className="sk sk-card" />
          </div>
        </>
      )}
      {variant === "table" &&
        Array.from({ length: 6 }, (_, i) => <span key={i} className="sk sk-row" style={{ opacity: 1 - i * 0.13 }} />)}
    </div>
  );
}
