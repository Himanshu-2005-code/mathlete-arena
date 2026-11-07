import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mathlete Arena: speed math duels",
    short_name: "Mathlete",
    description: "Speed math sprints, duels, daily challenges and number puzzles.",
    start_url: "/",
    display: "standalone",
    background_color: "#07090a",
    theme_color: "#07090a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
