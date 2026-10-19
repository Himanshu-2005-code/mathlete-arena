"use client";

import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
const KEY = "matik.theme";
const ORDER: Theme[] = ["system", "light", "dark"];

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function apply(t: Theme) {
  const el = document.documentElement;
  if (t === "system") delete el.dataset.theme;
  else el.dataset.theme = t;
}

/** Light, dark, or follow the device; remembered in this browser. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(read()), []);
  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    apply(next);
    setTheme(next);
  };
  return [theme, cycle];
}
