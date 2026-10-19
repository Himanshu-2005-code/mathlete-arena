/** A small line chart of rating after each duel, drawn in pencil on the grid. */
export function RatingChart({ points }: { points: number[] }) {
  const w = 600;
  const h = 180;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = Math.max(20, hi - lo);
  const mid = (lo + hi) / 2;
  const yMin = mid - span / 2 - span * 0.1;
  const yMax = mid + span / 2 + span * 0.1;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const first = points[0];
  const now = points[points.length - 1];
  const ticks = [hi, Math.round(mid), lo].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <figure className="rating-chart">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Rating went from ${first} to ${now}, between ${lo} and ${hi}.`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="rc-grid" />
            <text x={pad.l - 8} y={y(t)} className="rc-label" textAnchor="end" dominantBaseline="middle">
              {t}
            </text>
          </g>
        ))}
        <path d={d} className="rc-line" />
        <circle cx={x(points.length - 1)} cy={y(now)} r={4.5} className="rc-dot" />
      </svg>
      <figcaption className="hint">
        {now >= first ? "Up" : "Down"} {Math.abs(now - first)} from {first} to <strong>{now}</strong>.
      </figcaption>
    </figure>
  );
}
