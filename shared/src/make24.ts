import { type Frac, add, div, evaluateExpression, frac, fracEq, mul, sub } from "./expr";
import { createRng, randInt } from "./rng";

/**
 * Make 24: five hands of four numbers. For each hand, use all four numbers
 * exactly once, in any order, with + − × ÷ and brackets, to make 24.
 */

export type Make24Difficulty = "easy" | "hard";
export const MAKE24_TARGET = 24;
export const MAKE24_HANDS = 5;
export const MAKE24_RANGE: Record<Make24Difficulty, number> = { easy: 9, hard: 13 };

export interface Make24Puzzle {
  seed: number;
  difficulty: Make24Difficulty;
  hands: number[][];
  target: number;
  /** One known answer per hand. */
  solutions: string[];
}

export type PublicMake24 = Omit<Make24Puzzle, "solutions">;

/** Standard search: repeatedly combine two of the remaining numbers. */
export function solveMake24(nums: number[], target = MAKE24_TARGET): string | null {
  const search = (items: { f: Frac; e: string }[]): string | null => {
    if (items.length === 1) return fracEq(items[0].f, target) ? items[0].e : null;
    for (let i = 0; i < items.length; i++)
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const rest = items.filter((_, k) => k !== i && k !== j);
        const a = items[i];
        const b = items[j];
        const tries: [() => Frac, string][] = [
          [() => add(a.f, b.f), `(${a.e}+${b.e})`],
          [() => sub(a.f, b.f), `(${a.e}-${b.e})`],
          [() => mul(a.f, b.f), `(${a.e}×${b.e})`],
          [() => div(a.f, b.f), `(${a.e}÷${b.e})`],
        ];
        for (const [f, e] of tries) {
          let v: Frac;
          try {
            v = f();
          } catch {
            continue;
          }
          const found = search([...rest, { f: v, e }]);
          if (found) return found;
        }
      }
    return null;
  };
  const found = search(nums.map((n) => ({ f: frac(n), e: String(n) })));
  return found ? found.replace(/^\((.*)\)$/, "$1") : null;
}

export function generateMake24(seed: number, difficulty: Make24Difficulty): Make24Puzzle {
  const rng = createRng(seed);
  const hands: number[][] = [];
  const solutions: string[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (hands.length < MAKE24_HANDS && guard++ < 2000) {
    const hand = Array.from({ length: 4 }, () => randInt(rng, 1, MAKE24_RANGE[difficulty]));
    const id = [...hand].sort((a, b) => a - b).join(",");
    if (seen.has(id)) continue;
    const solution = solveMake24(hand);
    if (!solution) continue;
    seen.add(id);
    hands.push(hand);
    solutions.push(solution);
  }
  return { seed, difficulty, hands, target: MAKE24_TARGET, solutions };
}

export function make24ToPublic(p: Make24Puzzle): PublicMake24 {
  const { solutions: _, ...rest } = p;
  return rest;
}

/** Check one hand: all four numbers used once, only + − × ÷, makes the target. */
export function checkMake24Hand(hand: number[], expression: string, target = MAKE24_TARGET) {
  try {
    const { value, numbers } = evaluateExpression(expression, { allowPower: false, allowUnaryMinus: false });
    const used = numbers.map(Number).sort((a, b) => a - b).join(",");
    const want = [...hand].sort((a, b) => a - b).join(",");
    if (used !== want) return { solved: false, value, problem: `Use ${hand.join(", ")}, each exactly once.` };
    return { solved: fracEq(value, target), value, problem: null };
  } catch (e) {
    return { solved: false, value: null, problem: (e as Error).message };
  }
}

export function checkMake24(p: Pick<Make24Puzzle, "hands" | "target">, expressions: string[]) {
  return (
    expressions.length === p.hands.length && p.hands.every((h, i) => checkMake24Hand(h, expressions[i], p.target).solved)
  );
}
