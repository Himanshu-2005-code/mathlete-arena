import { type PracticeMode, type Question, generateQuestion } from "./questions";
import { createRng } from "./rng";

/** Duel rules shared by server and client. */
export const DUEL_SECONDS = 60;
export const DUEL_COUNTDOWN_MS = 3000;
export const START_RATING = 1000;
export const ELO_K = 32;

/**
 * The i-th question of a duel or daily sprint. Each question has its own RNG
 * stream so either side can generate any index without replaying the rest.
 * Difficulty climbs every 4 questions, from level 2 up to level 9.
 */
export function sequenceLevel(i: number): number {
  return Math.min(9, 2 + Math.floor(i / 4));
}

export function sequenceQuestion(seed: number, i: number, mode: PracticeMode = "mixed"): Question {
  const rng = createRng((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
  return generateQuestion(rng, mode, sequenceLevel(i));
}

/** Expected score of A against B. */
export function eloExpected(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** New ratings after a game. scoreA is 1 for an A win, 0.5 for a draw, 0 for a loss. */
export function eloUpdate(ratingA: number, ratingB: number, scoreA: 0 | 0.5 | 1, k = ELO_K): [number, number] {
  const delta = Math.round(k * (scoreA - eloExpected(ratingA, ratingB)));
  return [ratingA + delta, ratingB - delta];
}

/** A day key like "2026-10-09" in a fixed UTC offset (minutes). */
export function dayKey(date: Date, offsetMinutes: number): string {
  return new Date(date.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Stable seed for a day and purpose, so everyone gets the same challenge. */
export function dailySeed(day: string, purpose: "sprint" | "puzzle"): number {
  let h = 2166136261;
  for (const ch of `${day}:${purpose}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type DuelOutcome = "win" | "loss" | "draw";
export type DuelEndReason = "time" | "forfeit";

export interface DuelPlayerInfo {
  id: number;
  username: string;
  rating: number;
}

/** Server -> client events. */
export interface ServerToClientEvents {
  presence: (p: { online: number; searching: number }) => void;
  "queue:joined": () => void;
  "queue:left": () => void;
  "challenge:created": (c: { code: string }) => void;
  "challenge:error": (e: { message: string }) => void;
  "duel:start": (d: {
    duelId: string;
    seed: number;
    startsAt: number;
    endsAt: number;
    you: DuelPlayerInfo;
    opponent: DuelPlayerInfo;
  }) => void;
  "duel:progress": (p: { you: number; opponent: number; yourIndex: number }) => void;
  "duel:wrong": (w: { index: number }) => void;
  "duel:end": (e: {
    outcome: DuelOutcome;
    reason: DuelEndReason;
    you: number;
    opponent: number;
    rating: number;
    ratingChange: number;
  }) => void;
}

/** Client -> server events. */
export interface ClientToServerEvents {
  "queue:join": () => void;
  "queue:leave": () => void;
  "challenge:create": () => void;
  "challenge:join": (c: { code: string }) => void;
  "challenge:cancel": () => void;
  "duel:answer": (a: { index: number; value: number }) => void;
  "duel:forfeit": () => void;
}
