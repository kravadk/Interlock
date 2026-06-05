import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Interlock Control Plane",
    short_name: "Interlock",
    description:
      "Mantle-native pre-flight safety, evidence, benchmark, and integration control plane for autonomous AI agents.",
    start_url: "/app",
    display: "standalone",
    background_color: "#070a12",
    theme_color: "#38f2a6",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
