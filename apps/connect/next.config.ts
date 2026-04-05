import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xyiajtrvhlxaeplsiajj.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    // Node.js 24 breaks webpack's WasmHash in worker threads
    webpackBuildWorker: false,
  },
};

export default nextConfig;
