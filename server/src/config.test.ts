import { describe, expect, it } from "vitest";
import { checkJwtSecret, isAllowedOrigin } from "./config";

describe("isAllowedOrigin", () => {
  const list = "https://mathlete.vercel.app, https://*.vercel.app/,http://localhost:3000";
  it("accepts listed sites and subdomain wildcards", () => {
    expect(isAllowedOrigin("https://mathlete.vercel.app", list)).toBe(true);
    expect(isAllowedOrigin("https://mathlete-git-main-himanshu.vercel.app", list)).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000", list)).toBe(true);
    expect(isAllowedOrigin(undefined, list)).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isAllowedOrigin("https://evil.com", list)).toBe(false);
    expect(isAllowedOrigin("https://vercel.app.evil.com", list)).toBe(false);
    expect(isAllowedOrigin("http://mathlete.vercel.app", list)).toBe(false);
    expect(isAllowedOrigin("https://evil.com/x.vercel.app", list)).toBe(false);
  });
});

describe("checkJwtSecret", () => {
  const strong = "k3J9vQ2mXr8LpT5wZc7NbY4dHf6Gs1Ae0uIoPqRtVxW=";
  it("accepts a long random secret", () => {
    expect(checkJwtSecret(strong, true)).toBeNull();
    expect(checkJwtSecret(strong, false)).toBeNull();
  });
  it("refuses to run production without a real secret", () => {
    expect(checkJwtSecret(undefined, true)).toMatchObject({ error: expect.stringMatching(/not set/) });
    expect(checkJwtSecret("   ", true)).toMatchObject({ error: expect.stringMatching(/not set/) });
    expect(checkJwtSecret("dev-only-secret-change-me", true)).toMatchObject({ error: expect.stringMatching(/not set/) });
    expect(checkJwtSecret("changeme", true)).toMatchObject({ error: expect.stringMatching(/only 8 characters/) });
  });
  it("only warns in development", () => {
    expect(checkJwtSecret(undefined, false)).toMatchObject({ warning: expect.stringMatching(/not set/) });
    expect(checkJwtSecret("short", false)).toMatchObject({ warning: expect.stringMatching(/only 5/) });
  });
});
