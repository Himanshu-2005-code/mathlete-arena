import { describe, expect, it } from "vitest";
import {
  AdaptiveDifficulty,
  PRACTICE_MODES,
  checkCrossMath,
  createRng,
  evaluate,
  generateCrossMath,
  generateQuestion,
  toPublic,
} from "./index";

describe("generateQuestion", () => {
  it("produces correct integer answers for every mode and level", () => {
    const rng = createRng(42);
    for (const { id } of PRACTICE_MODES) {
      for (let level = 1; level <= 10; level++) {
        for (let i = 0; i < 200; i++) {
          const q = generateQuestion(rng, id, level);
          const expected =
            q.op === "+" ? q.a + q.b : q.op === "-" ? q.a - q.b : q.op === "×" ? q.a * q.b : q.a / q.b;
          expect(q.answer).toBe(expected);
          expect(Number.isInteger(q.answer)).toBe(true);
          expect(q.answer).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("is deterministic for a seed", () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 20; i++) expect(generateQuestion(a, "mixed", 5)).toEqual(generateQuestion(b, "mixed", 5));
  });
});

describe("AdaptiveDifficulty", () => {
  it("levels up after three fast answers and down after a miss", () => {
    const d = new AdaptiveDifficulty(1);
    d.record(true, 500);
    d.record(true, 500);
    expect(d.level).toBe(1);
    d.record(true, 500);
    expect(d.level).toBe(2);
    d.record(false, 500);
    expect(d.level).toBe(1);
  });

  it("levels down after two slow answers and stays within bounds", () => {
    const d = new AdaptiveDifficulty(3);
    d.record(true, 60_000);
    d.record(true, 60_000);
    expect(d.level).toBe(2);
    const low = new AdaptiveDifficulty(1);
    low.record(false, 1);
    expect(low.level).toBe(1);
  });
});

describe("evaluate", () => {
  it("respects precedence", () => {
    expect(evaluate(2, "+", 3, "×", 4)).toBe(14);
    expect(evaluate(2, "×", 3, "+", 4)).toBe(10);
    expect(evaluate(8, "÷", 2, "-", 1)).toBe(3);
    expect(evaluate(7, "÷", 2, "+", 1)).toBeNull();
  });
});

describe("cross-math", () => {
  it("generates puzzles whose solution checks out", () => {
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      for (let seed = 1; seed <= 100; seed++) {
        const p = generateCrossMath(seed, difficulty);
        const pub = toPublic(p);
        expect(checkCrossMath(pub, p.solution).solved).toBe(true);
        expect(pub.bank.length).toBe(p.hidden.flat().filter(Boolean).length);
      }
    }
  });

  it("is reproducible from its seed", () => {
    expect(generateCrossMath(99, "medium")).toEqual(generateCrossMath(99, "medium"));
  });

  it("rejects wrong or incomplete grids", () => {
    const p = generateCrossMath(5, "hard");
    const pub = toPublic(p);
    const empty = pub.given.map((row) => [...row]);
    const res = checkCrossMath(pub, empty);
    expect(res.complete).toBe(false);
    expect(res.solved).toBe(false);

    const bad = p.solution.map((row) => [...row]);
    // Put a number not in the bank into a hidden cell.
    outer: for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        if (p.hidden[r][c]) {
          bad[r][c] = 999;
          break outer;
        }
    expect(checkCrossMath(pub, bad).solved).toBe(false);
  });
});

import { dailySeed, dayKey, eloUpdate, sequenceLevel, sequenceQuestion } from "./duel";

describe("duel helpers", () => {
  it("generates the same question for a seed and index, in any order", () => {
    const forward = Array.from({ length: 30 }, (_, i) => sequenceQuestion(77, i));
    const backward = Array.from({ length: 30 }, (_, i) => sequenceQuestion(77, 29 - i)).reverse();
    expect(forward).toEqual(backward);
    expect(sequenceQuestion(77, 0)).not.toEqual(sequenceQuestion(78, 0));
    expect(sequenceLevel(0)).toBe(2);
    expect(sequenceLevel(100)).toBe(9);
  });

  it("updates Elo symmetrically", () => {
    expect(eloUpdate(1000, 1000, 1)).toEqual([1016, 984]);
    expect(eloUpdate(1000, 1000, 0.5)).toEqual([1000, 1000]);
    const [a, b] = eloUpdate(1400, 1000, 1);
    expect(a - 1400).toBeLessThan(5);
    expect(a + b).toBe(2400);
  });

  it("keys days by offset and seeds them stably", () => {
    const t = new Date("2026-10-08T19:00:00Z");
    expect(dayKey(t, 0)).toBe("2026-10-08");
    expect(dayKey(t, 330)).toBe("2026-10-09");
    expect(dailySeed("2026-10-09", "sprint")).toBe(dailySeed("2026-10-09", "sprint"));
    expect(dailySeed("2026-10-09", "sprint")).not.toBe(dailySeed("2026-10-09", "puzzle"));
  });
});

import { computeStreak, previousDay } from "./duel";

describe("daily streaks", () => {
  it("counts days in a row up to today or yesterday", () => {
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
    expect(computeStreak([], "2026-10-12")).toEqual({ current: 0, best: 0 });
    expect(computeStreak(["2026-10-10", "2026-10-11", "2026-10-12"], "2026-10-12")).toEqual({ current: 3, best: 3 });
    // Not played yet today: yesterday's streak still stands.
    expect(computeStreak(["2026-10-10", "2026-10-11"], "2026-10-12").current).toBe(2);
    // A missed day breaks it, but the best run is remembered.
    expect(computeStreak(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"], "2026-10-12")).toEqual({
      current: 0,
      best: 3,
    });
  });
});
