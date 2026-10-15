import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  output: "standalone",
  experimental: { cpus: 2 },
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_ORIGIN ?? "http://localhost:3001"}/api/:path*`,
      },
    ];
  },
};
export default config;
