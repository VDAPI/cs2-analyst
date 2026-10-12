import type { MetadataRoute } from "next";

/** PWA manifest (S18): installable on phones, opens straight into the matches list. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CS2 Analyst",
    short_name: "CS2 Analyst",
    description: "Analiza dem CS2: mechanika, taktyka, replay 2D. CS2 demo analysis.",
    start_url: "/matches?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#08070D",
    theme_color: "#08070D",
    lang: "pl",
    categories: ["games", "sports", "utilities"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Wgraj demo / Upload demo", url: "/upload", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Kolejka analiz / Analysis queue", url: "/queue", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Mecze / Matches", url: "/matches", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
