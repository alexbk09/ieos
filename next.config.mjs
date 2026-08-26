/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  async rewrites() {
    return [
      // Sirve el manual de usuario (documentación) y sus archivos de ejemplo
      // tanto en desarrollo como en producción (Vercel / Next.js standalone).
      { source: '/manual', destination: '/manual/index.html' },
    ]
  },
}

export default nextConfig
