import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 폴더의 다른 lockfile 을 루트로 오인하지 않도록
  turbopack: { root: process.cwd() },
};

export default nextConfig;
