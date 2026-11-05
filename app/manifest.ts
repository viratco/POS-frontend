import type { MetadataRoute } from "next";

// Every page is installable as "Mezana" with the Mezana icon. The counter (/staff) has its own manifest,
// counter.webmanifest, so an install from there opens straight onto the tables.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mezana",
    short_name: "Mezana",
    description: "Tables, orders, kitchen and bills for your café.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#1b070b",
    icons: [
      { src: "/mezana-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/mezana-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/mezana-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/mezana-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
