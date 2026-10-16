import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FONSAT · Gestão de equipas",
    short_name: "FONSAT",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#ec405c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
