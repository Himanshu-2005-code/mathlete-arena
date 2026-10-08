"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

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

  return (
    <header className="topbar">
      <Link href="/" className="wordmark">
        matik
      </Link>
      <nav aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      {ready && (
        <span className="who">
          {user ? (
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
          )}
        </span>
      )}
    </header>
  );
}
