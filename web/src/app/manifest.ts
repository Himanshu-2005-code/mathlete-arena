import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Matik: speed math",
    short_name: "Matik",
    description: "Speed math sprints, duels, daily challenges and number puzzles.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8fc",
    theme_color: "#1b2a6b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
