import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const PAGES = ["", "/duel", "/daily", "/practice", "/puzzles", "/arcade", "/leaderboard"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: p === "/daily" || p === "/leaderboard" ? "daily" : "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
