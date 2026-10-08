import { MAX_LEVEL, MIN_LEVEL, clampLevel } from "./questions";

/**
 * Adjusts difficulty from a player's pace and accuracy.
 *  - 3 fast correct answers in a row  -> level up
 *  - a wrong answer or 2 slow answers -> level down
 * "Fast" means under a time budget that grows with the level.
 */
export class AdaptiveDifficulty {
  level: number;
  private fastStreak = 0;
  private slowStreak = 0;

  constructor(startLevel = 1) {
    this.level = clampLevel(startLevel);
  }

  static targetMs(level: number): number {
    return 2500 + level * 600;
  }

  record(correct: boolean, ms: number): number {
    if (!correct) {
      this.fastStreak = 0;
      this.slowStreak = 0;
      this.level = Math.max(MIN_LEVEL, this.level - 1);
      return this.level;
    }

    if (ms <= AdaptiveDifficulty.targetMs(this.level)) {
      this.fastStreak++;
      this.slowStreak = 0;
      if (this.fastStreak >= 3) {
        this.level = Math.min(MAX_LEVEL, this.level + 1);
        this.fastStreak = 0;
      }
    } else {
      this.slowStreak++;
      this.fastStreak = 0;
      if (this.slowStreak >= 2) {
        this.level = Math.max(MIN_LEVEL, this.level - 1);
        this.slowStreak = 0;
      }
    }
    return this.level;
  }
}
