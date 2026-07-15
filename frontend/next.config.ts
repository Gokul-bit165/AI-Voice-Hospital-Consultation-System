import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,

  // Allow mobile devices on the local network to access HMR dev resources
  allowedDevOrigins: [
    "10.217.197.220",   // Mobile device IP
    "10.217.197.*",     // Entire local subnet (covers any device on the same Wi-Fi)
  ],

  // Proxy all /api/v1/* calls to the local FastAPI backend.
  // This means only ONE ngrok tunnel (port 3000) is needed for full mobile testing —
  // the browser never directly calls port 8000, so CORS and mic HTTPS issues are avoided.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://127.0.0.1:8000/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
