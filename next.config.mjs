/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Enable experimental optimizations for faster navigation
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
}

export default nextConfig
