import { headers } from "next/headers";

/**
 * The site's public address, for absolute links in the sitemap and robots.txt.
 * SITE_URL wins when set; otherwise it's worked out from the request, so the
 * same build is right on Render, Vercel or a custom domain.
 */
export async function siteUrl(): Promise<string> {
  const fixed = process.env.SITE_URL?.trim();
  if (fixed) return fixed.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
