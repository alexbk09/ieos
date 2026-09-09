/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      // CDN de imágenes de AliExpress (productos importados por el pipeline).
      // AliExpress usa dos CDN: el nuevo "aliexpress-media.com" (ej:
      // ae-pic-a1.aliexpress-media.com) y el clásico "alicdn.com" (ej:
      // ae01.alicdn.com). Sin estos patrones, next/image lanza el error
      // "hostname is not configured under images".
      { protocol: 'https', hostname: '**.aliexpress-media.com' },
      { protocol: 'https', hostname: '**.alicdn.com' },
    ],
  },
}

export default nextConfig
