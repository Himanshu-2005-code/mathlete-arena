"use client";

import { useEffect, useState } from "react";

/** Short synthesized blips for right and wrong answers; no audio files needed. */

const KEY = "mathlete.sound";
let ctx: AudioContext | null = null;
const listeners = new Set<(on: boolean) => void>();

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f(on));
}

export function useSoundSetting(): [boolean, (on: boolean) => void] {
  // Start on; read the saved choice after mount so server and client render the same.
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(soundOn());
    listeners.add(setOn);
    return () => void listeners.delete(setOn);
  }, []);
  return [on, setSoundOn];
}

function tone(freq: number, startIn: number, duration: number, type: OscillatorType, volume: number) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime + startIn;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    /* audio unavailable */
  }
}

export function playCorrect() {
  if (!soundOn()) return;
  tone(660, 0, 0.08, "triangle", 0.12);
  tone(990, 0.06, 0.1, "triangle", 0.1);
}

export function playWrong() {
  if (!soundOn()) return;
  tone(196, 0, 0.16, "square", 0.05);
}
