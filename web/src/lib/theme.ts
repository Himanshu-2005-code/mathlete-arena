"use client";

import { useEffect, useState } from "react";

/**
 * "hud" is the default tactical look (no data-theme on <html>); "light" and
 * "dark" are the original squared-paper notebook, by day and by night.
 */
export type Theme = "hud" | "light" | "dark";
const KEY = "matik.theme";
const ORDER: Theme[] = ["hud", "light", "dark"];
export const THEME_LABELS: Record<Theme, string> = { hud: "HUD", light: "Paper", dark: "Paper night" };

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "hud";
  } catch {
    return "hud";
  }
}

function apply(t: Theme) {
  const el = document.documentElement;
  if (t === "hud") delete el.dataset.theme;
  else el.dataset.theme = t;
}

/** Cycle HUD → Paper → Paper night; remembered in this browser. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("hud");
  useEffect(() => setTheme(read()), []);
  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    try {
      if (next === "hud") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    apply(next);
    setTheme(next);
  };
  return [theme, cycle];
}
