/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
};

export default nextConfig;
