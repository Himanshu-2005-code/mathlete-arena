"use client";

import { useEffect, useState } from "react";

/**
 * Copy the challenge link, with a visible "Copied" confirmation. On phones
 * that support it, also offers the system share sheet (WhatsApp, Messages...).
 */
export function ShareInvite({ link, code }: { link: string; code: string }) {
  const [state, setState] = useState<"" | "copied" | "failed">("");
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState(""), 2500);
  };

  const share = () =>
    navigator
      .share({ title: "Matik duel", text: `Race me at mental math on Matik. Code ${code}:`, url: link })
      .catch(() => {});

  return (
    <>
      <button type="button" className="btn ghost" onClick={copy}>
        {state === "copied" ? "Copied" : "Copy link"}
      </button>
      {canShare && (
        <button type="button" className="btn ghost" onClick={share}>
          Share
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Link copied" : state === "failed" ? "Couldn't copy; select the link and copy it" : ""}
      </span>
      {state === "failed" && <span className="error">Couldn&apos;t copy. Select the link and copy it.</span>}
    </>
  );
}
