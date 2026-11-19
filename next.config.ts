import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }],
  },
  // better-sqlite3 is a native module: keep it out of the server bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
