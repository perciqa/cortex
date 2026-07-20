import type { NextConfig } from "next";

const CORTEX_TARGET = process.env.CORTEX_API_TARGET ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.ARGUS_API_TARGET ?? "http://localhost:8000"}/api/:path*`,
      },
      {
        source: "/cortex-api/:path*",
        destination: `${CORTEX_TARGET}/:path*`,
      },
      {
        source: "/ws/events",
        destination: `${CORTEX_TARGET}/ws/events`,
      },
      {
        source: "/ws/metrics",
        destination: `${CORTEX_TARGET}/ws/metrics`,
      },
    ];
  },
};

export default nextConfig;
