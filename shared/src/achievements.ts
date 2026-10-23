import type { Stats } from "./types";

/**
 * Achievements are worked out from a player's stats every time, so there's
 * nothing extra to store and old games count too.
 */
export interface Achievement {
  id: string;
  title: string;
  about: string;
  earned: boolean;
}

type Rule = { id: string; title: string; about: string; test: (s: Stats) => boolean };

const bestSprint = (s: Stats) => Math.max(0, ...s.practice.bestByMode.map((m) => m.best));

const RULES: Rule[] = [
  { id: "first-sprint", title: "Off the line", about: "Finish a practice sprint.", test: (s) => s.practice.sessions >= 1 },
  { id: "sprint-100", title: "Century", about: "Score 100 points in one sprint.", test: (s) => bestSprint(s) >= 100 },
  { id: "first-puzzle", title: "Puzzled", about: "Solve a puzzle.", test: (s) => s.puzzles.solved >= 1 },
  { id: "puzzles-25", title: "Puzzle box", about: "Solve 25 puzzles.", test: (s) => s.puzzles.solved >= 25 },
  { id: "puzzles-100", title: "Grid master", about: "Solve 100 puzzles.", test: (s) => s.puzzles.solved >= 100 },
  { id: "first-win", title: "First blood", about: "Win a duel.", test: (s) => s.duels.won >= 1 },
  { id: "wins-10", title: "Duellist", about: "Win 10 duels.", test: (s) => s.duels.won >= 10 },
  { id: "rating-1200", title: "Climbing", about: "Reach a rating of 1200.", test: (s) => s.duels.peakRating >= 1200 },
  { id: "rating-1400", title: "Sharp", about: "Reach a rating of 1400.", test: (s) => s.duels.peakRating >= 1400 },
  { id: "streak-3", title: "Habit", about: "Play the daily 3 days in a row.", test: (s) => s.dailyStreak.best >= 3 },
  { id: "streak-7", title: "Week straight", about: "Play the daily 7 days in a row.", test: (s) => s.dailyStreak.best >= 7 },
  { id: "streak-30", title: "Month straight", about: "Play the daily 30 days in a row.", test: (s) => s.dailyStreak.best >= 30 },
  { id: "memory-10", title: "Elephant", about: "Remember 10 digits in Number Memory.", test: (s) => s.arcade.memory >= 10 },
  { id: "flash-5", title: "Abacus", about: "Reach level 5 in Flash Anzan.", test: (s) => s.arcade.flash >= 5 },
  {
    id: "blitz-30",
    title: "Blitzed",
    about: "Get 30 right in any 60-second blitz.",
    test: (s) => Math.max(s.arcade.truefalse, s.arcade.compare, s.arcade.sign) >= 30,
  },
];

export function achievements(stats: Stats): Achievement[] {
  return RULES.map(({ test, ...a }) => ({ ...a, earned: test(stats) }));
}
