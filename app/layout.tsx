import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/toast-provider'

export const metadata: Metadata = {
  title: 'ilumaX — Arquitectura de luz',
  description: 'Soluciones LED y revestimientos que convierten espacios en experiencias memorables.',
  generator: 'ilumaX',
}

export const viewport: Viewport = { colorScheme: 'light dark', themeColor: '#071d49' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className="bg-slate-50"><body className="antialiased">{children}<ToastProvider />{process.env.NODE_ENV === 'production' && <Analytics />}</body></html>
}
