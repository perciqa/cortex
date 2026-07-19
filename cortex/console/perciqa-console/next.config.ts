import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.ARGUS_API_TARGET ?? "http://localhost:8000"}/api/:path*`,
      },
      {
        source: "/cortex-api/:path*",
        destination: `${process.env.CORTEX_API_TARGET ?? "http://localhost:8080"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
