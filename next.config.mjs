/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: process.env.KIOSK_BUILD === 'true' ? 'export' : undefined,
}

export default nextConfig
