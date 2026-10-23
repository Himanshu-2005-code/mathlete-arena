import { type Stats, achievements } from "@matik/shared";

export function Achievements({ stats }: { stats: Stats }) {
  const list = achievements(stats);
  const earned = list.filter((a) => a.earned).length;
  return (
    <div className="section">
      <h2>
        Achievements{" "}
        <span className="muted">
          <span className="num">{earned}</span> of {list.length}
        </span>
      </h2>
      <ul className="badges">
        {list.map((a) => (
          <li key={a.id} className={a.earned ? "badge earned" : "badge"}>
            <strong>
              {a.earned && <span aria-label="Earned">✓ </span>}
              {a.title}
            </strong>
            <span>{a.about}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
