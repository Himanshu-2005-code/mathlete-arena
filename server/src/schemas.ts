import { z } from "zod";

/** Validation shared by the results and daily routes. */
export const puzzleKind = z.enum(["crossmath", "kenken", "sudoku", "maze"]);
export const answerGrid = z.array(z.array(z.number().int().nullable()).max(9)).max(9);
export const answerPath = z.array(z.tuple([z.number().int(), z.number().int()])).max(49);
