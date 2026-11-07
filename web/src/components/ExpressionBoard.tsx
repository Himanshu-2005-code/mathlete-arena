"use client";

import { useRef, useState } from "react";
import {
  type PublicHectoc,
  type PublicMake24,
  checkHectoc,
  checkMake24Hand,
  showFrac,
  tryEvaluate,
} from "@mathlete/shared";
import { playCorrect, playWrong } from "@/lib/sound";
import { formatTime } from "./CrossMathBoard";
import { useStopwatch } from "./useStopwatch";

export interface ExpressionSolved {
  expressions: string[];
  timeMs: number;
  mistakes: number;
}

type Props =
  | { kind: "hectoc"; puzzle: PublicHectoc; onSolved: (s: ExpressionSolved) => void }
  | { kind: "make24"; puzzle: PublicMake24; onSolved: (s: ExpressionSolved) => void };

const OPS = ["+", "−", "×", "÷", "(", ")"];

/** Show keyboard shortcuts (* / -) as the proper symbols. */
const pretty = (e: string) => e.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");

/** Type an expression with the keyboard or the pad, see its value live, and check it. */
export function ExpressionBoard(props: Props) {
  const isHectoc = props.kind === "hectoc";
  const hands = props.kind === "make24" ? props.puzzle.hands : [props.puzzle.digits];
  const target = props.puzzle.target;

  const [hand, setHand] = useState(0);
  const [text, setText] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [message, setMessage] = useState("");
  const [solved, setSolved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { elapsed, now } = useStopwatch(solved);

  const numbers = hands[hand];
  const typed = text.replace(/−/g, "-");
  const live = typed.trim() ? tryEvaluate(typed, { allowPower: isHectoc, allowUnaryMinus: isHectoc }) : null;
  // For Make 24, grey out numbers once they appear in the expression.
  const usedCounts = new Map<number, number>();
  if (live?.ok) for (const n of live.numbers) usedCounts.set(Number(n), (usedCounts.get(Number(n)) ?? 0) + 1);

  const insert = (s: string) => {
    setText((t) => t + s);
    setMessage("");
    inputRef.current?.focus();
  };

  const submit = () => {
    if (solved || !typed.trim()) return;
    const res = isHectoc
      ? checkHectoc({ digits: numbers, target }, typed)
      : checkMake24Hand(numbers, typed, target);
    if (res.solved) {
      playCorrect();
      const all = [...done, typed];
      if (all.length === hands.length) {
        setDone(all);
        setSolved(true);
        setMessage("");
        props.onSolved({ expressions: all, timeMs: now(), mistakes });
      } else {
        setDone(all);
        setHand((h) => h + 1);
        setText("");
        setMessage(`Hand ${all.length} done.`);
      }
      return;
    }
    playWrong();
    setMistakes((m) => m + 1);
    setMessage(
      res.problem ??
        (res.value ? `That makes ${showFrac(res.value)}, not ${target}.` : "That expression doesn't work out."),
    );
  };

  return (
    <>
      <div className="sprint-bar">
        <span>
          <span className="num">{formatTime(elapsed)}</span>
        </span>
        <span>
          <span className="num">{mistakes}</span>
          {mistakes === 1 ? "wrong try" : "wrong tries"}
        </span>
        {!isHectoc && (
          <span>
            Hand <span className="num">{Math.min(hand + 1, hands.length)}</span>of {hands.length}
          </span>
        )}
      </div>

      <div className="expr-board">
        <p className="maze-target">
          Make <span className="num">{target}</span>
        </p>
        <div className="expr-numbers" aria-label={isHectoc ? "Digits, in order" : "Numbers in this hand"}>
          {numbers.map((n, i) => {
            const used = !isHectoc && (usedCounts.get(n) ?? 0) > numbers.slice(0, i).filter((m) => m === n).length;
            return (
              <button
                key={i}
                type="button"
                className={`tile big${used ? " used" : ""}`}
                disabled={solved}
                onClick={() => insert(String(n))}
              >
                {n}
              </button>
            );
          })}
        </div>

        <form
          className="expr-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="expr" className="sr-only">
            Your expression
          </label>
          <input
            id="expr"
            ref={inputRef}
            className="text-input expr-input"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setMessage("");
            }}
            placeholder={isHectoc ? "e.g. 1+(2+3+4)×(5+6)" : "e.g. (8−2)×(3+1)"}
            autoComplete="off"
            spellCheck={false}
            disabled={solved}
          />
          <p className="expr-live" aria-live="polite">
            {live === null ? (
              <span className="muted">Type with the keyboard (* and / work too) or tap below.</span>
            ) : live.ok ? (
              <>
                = <span className="num">{showFrac(live.value)}</span>
              </>
            ) : (
              <span className="muted">{live.error}</span>
            )}
          </p>
          <div className="bank-tiles">
            {[...OPS, ...(isHectoc ? ["^"] : [])].map((op) => (
              <button key={op} type="button" className="tile" disabled={solved} onClick={() => insert(op)}>
                {op}
              </button>
            ))}
            <button
              type="button"
              className="tile erase"
              disabled={solved}
              onClick={() => {
                setText((t) => t.slice(0, -1));
                inputRef.current?.focus();
              }}
            >
              ⌫
            </button>
            <button
              type="button"
              className="tile erase"
              disabled={solved}
              onClick={() => {
                setText("");
                inputRef.current?.focus();
              }}
            >
              Clear
            </button>
          </div>
          <div className="actions">
            <button type="submit" className="btn" disabled={solved || !typed.trim()}>
              Check
            </button>
          </div>
        </form>
        {message && <p className={solved ? "notice" : message.startsWith("Hand") ? "notice" : "error"}>{message}</p>}
        {done.length > 0 && !isHectoc && (
          <ol className="expr-done">
            {done.map((e, i) => (
              <li key={i}>
                {hands[i].join(", ")}: {pretty(e)} = {target}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
