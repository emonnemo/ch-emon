import type { NextConfig } from "next";

const backendInternalUrl = process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    if (!backendInternalUrl) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backendInternalUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
