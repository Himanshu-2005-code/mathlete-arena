import type { Op } from "./questions";
import { type Rng, pick, randInt } from "./rng";

/**
 * Blitz: 60-second arcade rounds of quick decisions. Each question has a
 * prompt, two to four choices, and exactly one right choice.
 */

export type BlitzGame = "truefalse" | "compare" | "sign";

export const BLITZ_SECONDS = 60;
/** Seconds taken off the clock for a wrong choice. */
export const BLITZ_PENALTY_SECONDS = 3;

export interface BlitzQuestion {
  prompt: string;
  choices: string[];
  answer: number;
}

const show = (op: Op) => (op === "-" ? "−" : op);

function apply(a: number, op: Op, b: number): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return a / b;
  }
}

/** A clean a op b with a whole-number answer that grows with `level`. */
function fact(rng: Rng, level: number): { a: number; op: Op; b: number; v: number } {
  const op = pick(rng, ["+", "-", "×", "÷"] as const);
  const big = 10 + level * 8;
  if (op === "+" || op === "-") {
    let a = randInt(rng, 2, big);
    let b = randInt(rng, 2, big);
    if (op === "-" && b > a) [a, b] = [b, a];
    return { a, op, b, v: apply(a, op, b) };
  }
  const x = randInt(rng, 2, 6 + level);
  const y = randInt(rng, 2, 9 + Math.floor(level / 2));
  return op === "×" ? { a: x, op, b: y, v: x * y } : { a: x * y, op, b: y, v: x };
}

/** `level` rises with the number answered, so later questions are harder. */
export function blitzQuestion(game: BlitzGame, rng: Rng, level: number): BlitzQuestion {
  if (game === "truefalse") {
    const f = fact(rng, level);
    const truth = rng() < 0.5;
    // Near misses look right at a glance: off by a little, or by ten.
    let shown = f.v;
    if (!truth) {
      const nudges = [-10, -2, -1, 1, 2, 10].filter((d) => f.v + d >= 0);
      shown = f.v + pick(rng, nudges);
    }
    return { prompt: `${f.a} ${show(f.op)} ${f.b} = ${shown}`, choices: ["True", "False"], answer: truth ? 0 : 1 };
  }
  if (game === "compare") {
    for (;;) {
      const l = fact(rng, level);
      const r = fact(rng, level);
      if (l.v === r.v) continue;
      // Keep the gap small so it takes a little work.
      if (Math.abs(l.v - r.v) > Math.max(6, Math.max(l.v, r.v) * 0.3)) continue;
      return {
        prompt: "Which is bigger?",
        choices: [`${l.a} ${show(l.op)} ${l.b}`, `${r.a} ${show(r.op)} ${r.b}`],
        answer: l.v > r.v ? 0 : 1,
      };
    }
  }
  // Missing sign: only one operator may fit.
  const ops: Op[] = ["+", "-", "×", "÷"];
  for (;;) {
    const f = fact(rng, level);
    const fits = ops.filter((op) => {
      const v = apply(f.a, op, f.b);
      return Number.isInteger(v) && v === f.v;
    });
    if (fits.length !== 1) continue;
    return { prompt: `${f.a} ? ${f.b} = ${f.v}`, choices: ops.map(show), answer: ops.indexOf(f.op) };
  }
}
