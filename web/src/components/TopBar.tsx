"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSoundSetting } from "@/lib/sound";

const LINKS = [
  { href: "/duel", label: "Duel" },
  { href: "/daily", label: "Daily" },
  { href: "/practice", label: "Practice" },
  { href: "/puzzles", label: "Puzzles" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
];

export function TopBar() {
  const pathname = usePathname();
  const { user, ready, signOut } = useAuth();
  const [sound, setSound] = useSoundSetting();
  const [open, setOpen] = useState(false);

  // Close the phone menu whenever the page changes.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={`topbar${open ? " open" : ""}`}>
      <Link href="/" className="wordmark">
        matik
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
      <span className="who">
        <button
          type="button"
          className="linkish"
          aria-pressed={sound}
          onClick={() => setSound(!sound)}
          title="Play a sound for right and wrong answers"
        >
          Sound {sound ? "on" : "off"}
        </button>
        {ready &&
          (user ? (
            <>
              <Link href="/profile" className="who-name">
                {user.username} <span className="num">{user.rating}</span>
              </Link>
              <button type="button" onClick={signOut} className="linkish">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/auth">Sign in</Link>
          ))}
      </span>
    </header>
  );
}
