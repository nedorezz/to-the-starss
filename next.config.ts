import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone нужен только для локального exe/сервера;
  // для Vercel — обычная сборка (NEXT_OUTPUT=standalone включает standalone)
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
