import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@laihoe/demoparser2"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "steamcdn-a.akamaihd.net",
      },
    ],
  },
};

export default nextConfig;
