import { z } from "zod";

/** Validation shared by the results and daily routes. */
export const puzzleKind = z.enum(["crossmath", "kenken", "sudoku", "maze", "hectoc", "make24"]);
export const answerGrid = z.array(z.array(z.number().int().nullable()).max(9)).max(9);
export const answerPath = z.array(z.tuple([z.number().int(), z.number().int()])).max(49);
export const answerExpressions = z.array(z.string().max(200)).max(5);
export const arcadeGame = z.enum(["flash", "memory"]);
