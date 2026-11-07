import { OAuth2Client } from "google-auth-library";
import { GOOGLE_CLIENT_ID } from "./config";

/** What the server keeps from a verified Google sign-in. */
export interface GoogleProfile {
  sub: string;
  email?: string;
  name?: string;
}

/** Checks a Google ID token; returns the profile, or null if it isn't valid for this app. */
export type GoogleVerifier = (credential: string) => Promise<GoogleProfile | null>;

let client: OAuth2Client | null = null;

/**
 * Verifies the ID token Google's sign-in button hands the browser: Google's
 * signature, expiry, and that it was issued for our client ID. No client
 * secret is involved.
 */
export const verifyGoogleCredential: GoogleVerifier = async (credential) => {
  if (!GOOGLE_CLIENT_ID) return null;
  client ??= new OAuth2Client(GOOGLE_CLIENT_ID);
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || p.email_verified === false) return null;
    return { sub: p.sub, email: p.email, name: p.given_name || p.name };
  } catch {
    return null;
  }
};
