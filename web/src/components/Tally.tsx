/** A score drawn as tally marks in groups of five, the way you'd keep count on paper. */
export function Tally({ count, label }: { count: number; label: string }) {
  const groups = Math.floor(count / 5);
  const rest = count % 5;
  return (
    <span className="tally" role="img" aria-label={`${label}: ${count}`}>
      {Array.from({ length: groups }, (_, g) => (
        <svg key={g} viewBox="0 0 44 32" className="tally-group" aria-hidden>
          {[6, 14, 22, 30].map((x) => (
            <line key={x} x1={x} y1="3" x2={x} y2="29" />
          ))}
          <line x1="1" y1="25" x2="37" y2="7" />
        </svg>
      ))}
      {rest > 0 && (
        <svg viewBox={`0 0 ${rest * 8 + 4} 32`} className="tally-group" style={{ width: `${(rest * 8 + 4) / 44}em` }} aria-hidden>
          {Array.from({ length: rest }, (_, i) => (
            <line key={i} x1={6 + i * 8} y1="3" x2={6 + i * 8} y2="29" />
          ))}
        </svg>
      )}
    </span>
  );
}
