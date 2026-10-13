import { describe, expect, it } from "vitest";
import {
  checkHectoc,
  checkMake24,
  checkMake24Hand,
  createRng,
  evaluateExpression,
  FLASH_LEVELS,
  flashNumbers,
  generateHectoc,
  generateMake24,
  isPlausibleArcadeScore,
  memoryNumber,
  showFrac,
  solveMake24,
  tryEvaluate,
  verifyPuzzle,
} from "./index";

describe("expression engine", () => {
  it("follows precedence and works in exact fractions", () => {
    const v = (s: string) => showFrac(evaluateExpression(s).value);
    expect(v("2+3×4")).toBe("14");
    expect(v("(2+3)×4")).toBe("20");
    expect(v("8÷3×3")).toBe("8");
    expect(v("2^3^2")).toBe("512");
    expect(v("-2^2")).toBe("-4");
    expect(v("1/3+1/6")).toBe("1/2");
    expect(v("7 * (15 - 1/(7/5))")).toBe("100");
  });

  it("records the numbers typed and rejects junk safely", () => {
    expect(evaluateExpression("12+3×45").numbers).toEqual(["12", "3", "45"]);
    for (const bad of ["", "1+", "(1+2", "1+2)", "2÷0", "alert(1)", "2^99", "1..2"]) {
      expect(tryEvaluate(bad).ok).toBe(false);
    }
    expect(tryEvaluate("-3", { allowUnaryMinus: false }).ok).toBe(false);
    expect(tryEvaluate("2^3", { allowPower: false }).ok).toBe(false);
  });
});

describe("Hectoc", () => {
  it("only deals solvable digits, and its own answer checks out", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = generateHectoc(seed);
      expect(p.digits).toHaveLength(6);
      expect(checkHectoc(p, p.solution).solved).toBe(true);
      expect(verifyPuzzle("hectoc", seed, "standard", { expressions: [p.solution] })).toBe(true);
    }
  });

  it("requires every digit, in order", () => {
    const p = { digits: [1, 2, 3, 4, 5, 6], target: 100 };
    expect(checkHectoc(p, "1+2+3+4+5×6×(…)").solved).toBe(false);
    expect(checkHectoc(p, "1+2+3-4+(5+6)").problem).toBeNull(); // right digits, wrong total
    expect(checkHectoc(p, "(1+2+3+4)×(5+6)").solved).toBe(false); // 110
    expect(checkHectoc(p, "1+(2+3+4)×(5+6)").solved).toBe(true); // 100
    expect(checkHectoc(p, "2+1+(3+4)×(5+6)").problem).toMatch(/order/);
    expect(checkHectoc(p, "12×3-4+56+12").problem).toMatch(/order/);
  });
});

describe("Make 24", () => {
  it.each(["easy", "hard"] as const)("deals five distinct solvable %s hands", (difficulty) => {
    for (let seed = 1; seed <= 10; seed++) {
      const p = generateMake24(seed, difficulty);
      expect(p.hands).toHaveLength(5);
      expect(checkMake24(p, p.solutions)).toBe(true);
      expect(verifyPuzzle("make24", seed, difficulty, { expressions: p.solutions })).toBe(true);
    }
  });

  it("checks each hand's numbers and total", () => {
    expect(solveMake24([1, 1, 1, 1])).toBeNull();
    expect(solveMake24([3, 3, 8, 8])).not.toBeNull(); // the famous 8 ÷ (3 − 8 ÷ 3)
    expect(checkMake24Hand([3, 3, 8, 8], "8÷(3-8÷3)").solved).toBe(true);
    expect(checkMake24Hand([3, 3, 8, 8], "8×3").problem).toMatch(/each exactly once/);
    expect(checkMake24Hand([3, 3, 8, 8], "33-8-8+7").solved).toBe(false);
    expect(checkMake24Hand([2, 3, 4, 1], "2^3×(4-1)").solved).toBe(false); // no powers
  });
});

describe("arcade", () => {
  it("flashes numbers of the right size that never repeat back to back", () => {
    const rng = createRng(4);
    for (const level of FLASH_LEVELS) {
      const nums = flashNumbers(rng, level);
      expect(nums).toHaveLength(level.count);
      for (const [i, n] of nums.entries()) {
        expect(String(n).length).toBe(level.digits);
        if (i) expect(n).not.toBe(nums[i - 1]);
      }
    }
  });

  it("builds memory numbers of the asked length and refuses impossible scores", () => {
    const rng = createRng(9);
    for (let len = 3; len < 20; len++) expect(memoryNumber(rng, len)).toMatch(new RegExp(`^[1-9]\\d{${len - 1}}$`));
    expect(isPlausibleArcadeScore("flash", 10)).toBe(true);
    expect(isPlausibleArcadeScore("flash", 11)).toBe(false);
    expect(isPlausibleArcadeScore("memory", 2.5)).toBe(false);
  });
});
