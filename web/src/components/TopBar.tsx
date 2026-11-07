"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSoundSetting } from "@/lib/sound";
import { THEME_LABELS, useTheme } from "@/lib/theme";

const LINKS = [
  { href: "/duel", label: "Duel" },
  { href: "/daily", label: "Daily" },
  { href: "/practice", label: "Practice" },
  { href: "/puzzles", label: "Puzzles" },
  { href: "/arcade", label: "Arcade" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
];

export function TopBar() {
  const pathname = usePathname();
  const { user, ready, signOut } = useAuth();
  const [sound, setSound] = useSoundSetting();
  const [open, setOpen] = useState(false);
  const [theme, cycleTheme] = useTheme();

  // Close the phone menu whenever the page changes.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={`topbar${open ? " open" : ""}`}>
      <Link href="/" className="wordmark" aria-label="Mathlete Arena home">
        mathlete
      </Link>
      <button
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="main-nav"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <nav id="main-nav" aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="who">
        {ready && !user && (
          <Link href="/auth" className="who-signin">
            Sign in
          </Link>
        )}
        <AccountMenu
          label={
            user ? (
              <>
                <span className="who-user">{user.username}</span> <span className="num">{user.rating}</span>
              </>
            ) : (
              "Settings"
            )
          }
        >
          {user && (
            <Link href="/profile#account" role="menuitem">
              Account settings
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={cycleTheme}
            title="Switch between the HUD look and the paper notebook (day or night)"
          >
            Theme <span className="menu-value">{THEME_LABELS[theme]}</span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={sound}
            onClick={() => setSound(!sound)}
            title="Play a sound for right and wrong answers"
          >
            Sound <span className="menu-value">{sound ? "On" : "Off"}</span>
          </button>
          {user && (
            <button type="button" role="menuitem" onClick={signOut}>
              Sign out
            </button>
          )}
        </AccountMenu>
      </div>
    </header>
  );
}

/** A small dropdown that closes on outside click, Escape, or page change. */
function AccountMenu({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          {children}
        </div>
      )}
    </div>
  );
}
