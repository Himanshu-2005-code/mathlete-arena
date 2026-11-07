"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type GoogleId = {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const s = existing ?? Object.assign(document.createElement("script"), { src: SCRIPT, async: true, defer: true });
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("Couldn't load Google sign-in")));
    if (!existing) document.head.appendChild(s);
  });
}

/**
 * "Sign in with Google", shown only when the server has a Google client ID.
 * Works for new and returning players: the first sign-in creates the account.
 */
export function GoogleButton({ onDone, onError }: { onDone: () => void; onError: (msg: string) => void }) {
  const { signInWithGoogle } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Latest callbacks, so the button isn't redrawn on every parent render.
  const done = useRef(onDone);
  const fail = useRef(onError);
  done.current = onDone;
  fail.current = onError;

  useEffect(() => {
    api
      .config()
      .then((c) => setClientId(c.googleClientId))
      .catch(() => setClientId(null));
  }, []);

  useEffect(() => {
    if (!clientId || !ref.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            setBusy(true);
            try {
              await signInWithGoogle(credential);
              done.current();
            } catch (err) {
              fail.current((err as Error).message);
            } finally {
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: document.documentElement.dataset.theme === "light" ? "outline" : "filled_black",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 300,
        });
      })
      .catch((e: Error) => fail.current(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, signInWithGoogle]);

  if (!clientId) return null;
  return (
    <div className="google-signin">
      <p className="or-line">
        <span>or</span>
      </p>
      <div ref={ref} aria-busy={busy} />
    </div>
  );
}
