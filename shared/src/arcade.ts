import { type Rng, randInt } from "./rng";

/**
 * Arcade games: endless runs where your score is how far you get.
 *  - Flash Anzan: numbers flash one at a time; add them in your head. Ten levels.
 *  - Number Memory: a number shows briefly; type it back. One digit longer each round.
 */

export type ArcadeGame = "flash" | "memory";

export const ARCADE_GAMES: { id: ArcadeGame; label: string; rules: string; unit: string; max: number }[] = [
  {
    id: "flash",
    label: "Flash Anzan",
    rules:
      "Numbers flash on screen one at a time. Add them up in your head and type the total. Each level flashes more numbers, bigger and faster. One wrong total ends the run.",
    unit: "level",
    max: 10,
  },
  {
    id: "memory",
    label: "Number Memory",
    rules:
      "A number appears for a moment. Type it back once it's gone. Each round adds a digit. One mistake ends the run.",
    unit: "digits",
    max: 40,
  },
];

export const arcadeInfo = (game: ArcadeGame) => ARCADE_GAMES.find((g) => g.id === game)!;

export interface FlashLevel {
  count: number;
  digits: number;
  intervalMs: number;
}

export const FLASH_LEVELS: FlashLevel[] = [
  { count: 3, digits: 1, intervalMs: 1000 },
  { count: 5, digits: 1, intervalMs: 900 },
  { count: 5, digits: 1, intervalMs: 700 },
  { count: 4, digits: 2, intervalMs: 1000 },
  { count: 6, digits: 2, intervalMs: 900 },
  { count: 8, digits: 2, intervalMs: 800 },
  { count: 10, digits: 2, intervalMs: 700 },
  { count: 5, digits: 3, intervalMs: 1000 },
  { count: 8, digits: 3, intervalMs: 800 },
  { count: 10, digits: 3, intervalMs: 600 },
];

/** Numbers to flash for a level; neighbours never repeat, so each flash is visibly new. */
export function flashNumbers(rng: Rng, level: FlashLevel): number[] {
  const lo = 10 ** (level.digits - 1);
  const hi = 10 ** level.digits - 1;
  const out: number[] = [];
  while (out.length < level.count) {
    const v = randInt(rng, level.digits === 1 ? 1 : lo, hi);
    if (v !== out[out.length - 1]) out.push(v);
  }
  return out;
}

/** How long a number of this length stays on screen in Number Memory. */
export const memoryShowMs = (length: number) => 1000 + length * 600;

export function memoryNumber(rng: Rng, length: number): string {
  let s = String(randInt(rng, 1, 9));
  while (s.length < length) s += String(randInt(rng, 0, 9));
  return s;
}

export const MEMORY_START = 3;

/** Scores above these are not humanly reachable here, so they're refused. */
export const isPlausibleArcadeScore = (game: ArcadeGame, score: number) =>
  Number.isInteger(score) && score >= 0 && score <= arcadeInfo(game).max;
