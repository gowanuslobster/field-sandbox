import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/field-sandbox",
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
};

export default nextConfig;
