import { describe, expect, it } from "vitest";
import {
  ARCADE_GAMES,
  checkFutoshiki,
  checkKiller,
  createRng,
  blitzQuestion,
  generateFutoshiki,
  generateKiller,
  isPlausibleArcadeScore,
  killerRules,
  solveGrid,
  verifyPuzzle,
} from "./index";

describe("Killer Sudoku", () => {
  it("has exactly one solution, cages with distinct digits, and few givens", () => {
    let givens = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const p = generateKiller(seed);
      expect(solveGrid(killerRules(p), p.givens, 2).count).toBe(1);
      expect(checkKiller(p, p.solution).solved).toBe(true);
      for (const cage of p.cages) {
        const vals = cage.cells.map(([r, c]) => p.solution[r][c]);
        expect(new Set(vals).size).toBe(vals.length);
      }
      expect(p.cages.flatMap((c) => c.cells)).toHaveLength(36);
      for (const cage of p.cages) {
        const boxes = new Set(cage.cells.map(([r, c]) => Math.floor(r / 2) * 2 + Math.floor(c / 3)));
        expect(boxes.size).toBe(1);
      }
      givens += p.givens.flat().filter((v) => v !== null).length;
      expect(verifyPuzzle("killer", seed, "easy", { grid: p.solution })).toBe(true);
    }
    expect(givens / 15).toBeLessThan(8);
  });

  it("rejects a wrong cage total", () => {
    const p = generateKiller(2);
    const bad = p.solution.map((row) => [...row]);
    // Swap two digits within a row: rows still fine, but cages break.
    [bad[0][0], bad[0][1]] = [bad[0][1], bad[0][0]];
    expect(checkKiller(p, bad).solved).toBe(false);
  });
});

describe("Futoshiki", () => {
  it.each(["easy", "hard"] as const)("generates %s puzzles with exactly one solution", (difficulty) => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = generateFutoshiki(seed, difficulty);
      expect(solveGrid({ size: p.size, lessThan: p.lessThan }, p.givens, 2).count).toBe(1);
      expect(checkFutoshiki(p, p.solution).solved).toBe(true);
      for (const [[ar, ac], [br, bc]] of p.lessThan) {
        expect(Math.abs(ar - br) + Math.abs(ac - bc)).toBe(1);
        expect(p.solution[ar][ac]).toBeLessThan(p.solution[br][bc]);
      }
      expect(verifyPuzzle("futoshiki", seed, difficulty, { grid: p.solution })).toBe(true);
    }
  });

  it("flags a broken sign", () => {
    const p = generateFutoshiki(4, "easy");
    const [[ar, ac], [br, bc]] = p.lessThan[0];
    const grid = p.solution.map((row) => row.map(() => null as number | null));
    grid[ar][ac] = 5;
    grid[br][bc] = 1;
    const res = checkFutoshiki({ ...p, givens: grid.map((row) => row.map(() => null)) }, grid);
    expect(res.conflicts[ar][ac]).toBe(true);
  });
});

describe("Blitz", () => {
  it.each(["truefalse", "compare", "sign"] as const)("%s questions have one right answer", (game) => {
    const rng = createRng(11);
    for (let i = 0; i < 300; i++) {
      const q = blitzQuestion(game, rng, Math.floor(i / 10));
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
      if (game === "sign") {
        const [a, , b, , v] = q.prompt.split(" ");
        const fits = ["+", "−", "×", "÷"].filter((op) => {
          const x = Number(a);
          const y = Number(b);
          const r = op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
          return r === Number(v);
        });
        expect(fits).toEqual([q.choices[q.answer]]);
      }
      if (game === "truefalse") {
        const [a, op, b, , shown] = q.prompt.split(" ");
        const x = Number(a);
        const y = Number(b);
        const v = op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
        expect(q.answer === 0).toBe(v === Number(shown));
      }
    }
  });

  it("knows every arcade game's score ceiling", () => {
    expect(ARCADE_GAMES.map((g) => g.id)).toEqual(["flash", "memory", "truefalse", "compare", "sign"]);
    expect(isPlausibleArcadeScore("sign", 200)).toBe(true);
    expect(isPlausibleArcadeScore("sign", 201)).toBe(false);
  });
});

describe("nextDayStart", () => {
  it("returns the next midnight in the given offset", async () => {
    const { nextDayStart, dayKey } = await import("./duel");
    // 23:00 IST on 18 Oct is 17:30 UTC; the next IST midnight is 18:30 UTC.
    const at = new Date("2026-10-18T17:30:00Z");
    expect(nextDayStart(at, 330).toISOString()).toBe("2026-10-18T18:30:00.000Z");
    expect(dayKey(nextDayStart(at, 330), 330)).toBe("2026-10-19");
    expect(nextDayStart(new Date("2026-10-18T00:00:00Z"), 0).toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });
});
