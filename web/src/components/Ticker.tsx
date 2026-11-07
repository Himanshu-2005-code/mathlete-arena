const ITEMS = [
  "Duels // 60 seconds, same questions",
  "Daily // six games, reset at midnight IST",
  "Puzzles // 8 types, every one has exactly one answer",
  "Rating // Elo, everyone starts at 1000",
  "Hectoc // make 100 from six digits",
  "Flash Anzan // up to ten 3-digit numbers",
  "Blitz // a wrong answer costs 3 seconds",
  "Achievements // 15 to earn",
];

/** A slow scrolling strip of facts about the game, like a HUD feed. */
export function Ticker() {
  const row = (hidden: boolean) => (
    <ul className="ticker-row" aria-hidden={hidden || undefined}>
      {ITEMS.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
  return (
    <div className="ticker" aria-label="About Mathlete Arena">
      <div className="ticker-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
