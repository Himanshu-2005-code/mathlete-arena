import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const PAGES = ["", "/duel", "/daily", "/practice", "/puzzles", "/arcade", "/leaderboard", "/privacy", "/terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl();
  return PAGES.map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "/daily" || p === "/leaderboard" ? "daily" : "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
