/** A radar sweep with a pulsing contact in the middle, shown while searching. */
export function Radar({ seconds }: { seconds: number }) {
  return (
    <div className="radar" aria-hidden>
      <div className="radar-rings" />
      <div className="radar-sweep" />
      <div className="radar-dot" />
      <div className="radar-dot ping" />
      <span className="radar-time num">{seconds}s</span>
    </div>
  );
}
