import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev:lan` sets LAN_IP so phones on the same Wi-Fi can load the dev server.
  allowedDevOrigins: process.env.LAN_IP ? [process.env.LAN_IP] : [],
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nobody can embed our pages in a hidden frame (clickjacking the staff dashboard).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Never send the full URL (which contains the table's QR token) to other sites,
          // e.g. when the menu loads a photo hosted elsewhere.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
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
