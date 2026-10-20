/** Public address of the site, for absolute links (sitemap, robots). Set SITE_URL when building. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
