import type { Metadata, Viewport } from 'next'
import { Prompt, JetBrains_Mono } from 'next/font/google'
import OfflineBar from '@/components/OfflineBar'
import './globals.css'

// Body and display are both Prompt — the shop picked it, and one voice across
// headings and text reads more settled than a serif fighting a sans on a till
// screen. Weight and size carry the hierarchy instead.
const prompt = Prompt({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
  variable: '--font-prompt',
})

// Figures stay monospaced. Prices, totals and quantities sit in columns, and
// a proportional face makes those columns jitter row to row no matter what
// `tabular-nums` claims.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: 'Food Order | ระบบสั่งอาหาร',
  description: 'ระบบจัดการเมนูและสั่งอาหารสำหรับร้านอาหาร',
  manifest: '/manifest.webmanifest',
  // Lets staff add the POS to the home screen and run it without browser chrome.
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Food Order POS' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
}

export const viewport: Viewport = {
  // Match the POS canvas so the mobile status bar blends in
  themeColor: '#f5f6f8',
  width: 'device-width',
  initialScale: 1,
  // A pinch-zoom on a handheld till is always an accident — it leaves staff
  // on a half-scrolled screen mid-order. The trade against WCAG 1.4.4 is
  // deliberate: this is a pinned single-purpose device, and the type scale is
  // set for arm's length already.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      className={`${prompt.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <OfflineBar />
        {children}
      </body>
    </html>
  )
}
