import { type Rng, pick, randInt } from "./rng";

export type Op = "+" | "-" | "×" | "÷";
export type PracticeMode = "add" | "sub" | "mul" | "div" | "mixed";

export const PRACTICE_MODES: { id: PracticeMode; label: string; symbol: string }[] = [
  { id: "mixed", label: "Mixed", symbol: "±×÷" },
  { id: "add", label: "Addition", symbol: "+" },
  { id: "sub", label: "Subtraction", symbol: "−" },
  { id: "mul", label: "Multiplication", symbol: "×" },
  { id: "div", label: "Division", symbol: "÷" },
];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 10;

export interface Question {
  a: number;
  b: number;
  op: Op;
  answer: number;
  level: number;
  text: string;
}

// Upper bound of operands for + and −, per level (index = level - 1).
const ADD_MAX = [10, 20, 30, 50, 75, 100, 150, 250, 500, 1000];
// Operand ranges for × (and ÷, which is generated as the inverse of ×).
const MUL_A_MAX = [5, 9, 10, 12, 12, 15, 20, 25, 40, 99];
const MUL_B_MAX = [5, 5, 9, 9, 12, 12, 15, 15, 20, 30];

export function clampLevel(level: number): number {
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)));
}

function opForMode(rng: Rng, mode: PracticeMode): Op {
  switch (mode) {
    case "add":
      return "+";
    case "sub":
      return "-";
    case "mul":
      return "×";
    case "div":
      return "÷";
    case "mixed":
      return pick(rng, ["+", "-", "×", "÷"] as const);
  }
}

export function generateQuestion(rng: Rng, mode: PracticeMode, level: number): Question {
  const lv = clampLevel(level);
  const i = lv - 1;
  const op = opForMode(rng, mode);
  let a: number;
  let b: number;
  let answer: number;

  switch (op) {
    case "+": {
      const max = ADD_MAX[i];
      const min = lv <= 2 ? 1 : Math.ceil(max / 10);
      a = randInt(rng, min, max);
      b = randInt(rng, min, max);
      answer = a + b;
      break;
    }
    case "-": {
      const max = ADD_MAX[i];
      const min = lv <= 2 ? 1 : Math.ceil(max / 10);
      const x = randInt(rng, min, max);
      const y = randInt(rng, min, max);
      a = Math.max(x, y);
      b = Math.min(x, y);
      answer = a - b;
      break;
    }
    case "×": {
      a = randInt(rng, 2, MUL_A_MAX[i]);
      b = randInt(rng, 2, MUL_B_MAX[i]);
      answer = a * b;
      break;
    }
    case "÷": {
      // a ÷ b = answer, built from answer × b so it always divides exactly.
      b = randInt(rng, 2, MUL_B_MAX[i]);
      answer = randInt(rng, 2, MUL_A_MAX[i]);
      a = b * answer;
      break;
    }
  }

  const shown = op === "-" ? "−" : op;
  return { a, b, op, answer, level: lv, text: `${a} ${shown} ${b}` };
}

/** Points for a correct answer: harder questions are worth more. */
export function pointsFor(question: Question): number {
  return question.level;
}
