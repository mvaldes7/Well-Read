import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest (Next metadata file convention). The icon files live in
// public/icons/ so the manifest can reference them by exact, stable paths; each path is
// allow-listed for signed-out access in src/lib/auth/logic.mjs (PUBLIC_PATHS).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Well-Read",
    short_name: "Well-Read",
    description: "Learn foundational subjects: history, philosophy, the arts and poetry.",
    start_url: "/",
    display: "standalone",
    theme_color: "#232326", // --char, the header band
    background_color: "#eeebe5", // --wall, the page background
    icons: [
      { src: "/icons/well-read-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/well-read-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
