import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./config";

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
