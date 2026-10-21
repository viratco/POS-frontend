import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev:lan` sets LAN_IP so phones on the same Wi-Fi can load the dev server.
  allowedDevOrigins: process.env.LAN_IP ? [process.env.LAN_IP] : [],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
