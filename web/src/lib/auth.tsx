"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PublicUser } from "@matik/shared";
import { SESSION_EXPIRED_EVENT, api, getToken, setToken } from "./api";
import { closeSocket } from "./socket";

interface AuthState {
  user: PublicUser | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Re-fetch the signed-in user, e.g. after a duel changes their rating. */
  refresh: () => Promise<void>;
  /** True after the server ended the session; cleared by signing in or dismissing. */
  expired: boolean;
  dismissExpired: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);

  // The API layer announces a rejected token; sign out here so every page agrees.
  useEffect(() => {
    const onExpired = () => {
      setUser((u) => {
        if (u) setExpired(true);
        return null;
      });
      closeSocket();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);
  const dismissExpired = useCallback(() => setExpired(false), []);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (err?.status === 401) setToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    setToken(res.token);
    setUser(res.user);
    setExpired(false);
  }, []);

  const signUp = useCallback(async (username: string, password: string) => {
    const res = await api.register(username, password);
    setToken(res.token);
    setUser(res.user);
    setExpired(false);
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    closeSocket();
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    const { user } = await api.me();
    setUser(user);
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signUp, signOut, refresh, expired, dismissExpired }),
    [user, ready, signIn, signUp, signOut, refresh, expired, dismissExpired],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
