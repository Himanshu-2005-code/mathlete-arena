import { type Frac, add, div, evaluateExpression, frac, fracEq, mul, pow, sub } from "./expr";
import { createRng, randInt } from "./rng";

/**
 * Hectoc: six digits in a fixed order. Put operators (+ − × ÷ ^) and brackets
 * between them to make exactly 100. Digits stay in order, and neighbours may
 * be joined into one number (1 2 → 12).
 */

export const HECTOC_TARGET = 100;

export interface HectocPuzzle {
  seed: number;
  difficulty: "standard";
  digits: number[];
  target: number;
  /** One known way to make the target. */
  solution: string;
}

export type PublicHectoc = Omit<HectocPuzzle, "solution">;

type Values = Map<string, { f: Frac; e: string }>;
const key = (f: Frac) => `${f.n}/${f.d}`;

function combine(a: Frac, b: Frac, ea: string, eb: string, out: Values) {
  const put = (f: () => Frac, e: string) => {
    try {
      const v = f();
      const k = key(v);
      if (!out.has(k)) out.set(k, { f: v, e });
    } catch {
      /* skip divisions by zero and overflow */
    }
  };
  put(() => add(a, b), `${ea}+${eb}`);
  put(() => sub(a, b), `${ea}-${eb}`);
  put(() => mul(a, b), `${ea}×${eb}`);
  if (b.n !== 0) put(() => div(a, b), `${ea}÷${eb}`);
  if (b.d === 1 && b.n >= 0 && b.n <= 5 && Math.abs(a.n) ** b.n <= 1e6 && a.d ** b.n <= 1e6) {
    put(() => pow(a, b), `${ea}^${eb}`);
  }
}

const wrap = (e: string) => (/^\d+$/.test(e) ? e : `(${e})`);

/** Find a way to make the target, or null. Searches every bracketing and every join of neighbours. */
export function solveHectoc(digits: number[], target = HECTOC_TARGET): string | null {
  const n = digits.length;
  const memo = new Map<string, Values>();
  const values = (i: number, j: number): Values => {
    const k = `${i},${j}`;
    const hit = memo.get(k);
    if (hit) return hit;
    const out: Values = new Map();
    const literal = digits.slice(i, j).join("");
    out.set(key(frac(Number(literal))), { f: frac(Number(literal)), e: literal });
    for (let m = i + 1; m < j; m++) {
      const L = values(i, m);
      const R = values(m, j);
      for (const a of L.values()) for (const b of R.values()) combine(a.f, b.f, wrap(a.e), wrap(b.e), out);
      if (out.size > 60_000) break;
    }
    memo.set(k, out);
    return out;
  };
  // The whole row only needs to be checked against the target, not stored.
  const literal = digits.join("");
  if (Number(literal) === target) return literal;
  for (let m = 1; m < n; m++) {
    const L = values(0, m);
    const R = values(m, n);
    for (const a of L.values())
      for (const b of R.values()) {
        const out: Values = new Map();
        combine(a.f, b.f, wrap(a.e), wrap(b.e), out);
        for (const v of out.values()) if (fracEq(v.f, target)) return v.e;
      }
  }
  return null;
}

export function generateHectoc(seed: number): HectocPuzzle {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const digits = Array.from({ length: 6 }, () => randInt(rng, 1, 9));
    const solution = solveHectoc(digits);
    if (solution) return { seed, difficulty: "standard", digits, target: HECTOC_TARGET, solution };
  }
  throw new Error("Could not generate a Hectoc");
}

export function hectocToPublic(p: HectocPuzzle): PublicHectoc {
  const { solution: _, ...rest } = p;
  return rest;
}

/** Explain what's wrong with an attempt, or confirm it. */
export function checkHectoc(p: Pick<HectocPuzzle, "digits" | "target">, expression: string) {
  try {
    const { value, numbers } = evaluateExpression(expression);
    const used = numbers.join("");
    const want = p.digits.join("");
    if (used !== want) {
      return { solved: false, value, problem: `Use the digits ${p.digits.join(" ")} once each, in that order.` };
    }
    if (!fracEq(value, p.target)) return { solved: false, value, problem: null };
    return { solved: true, value, problem: null };
  } catch (e) {
    return { solved: false, value: null, problem: (e as Error).message };
  }
}
