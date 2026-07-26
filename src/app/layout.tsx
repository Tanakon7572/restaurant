import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_Thai } from 'next/font/google'
import OfflineBar from '@/components/OfflineBar'
import './globals.css'

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  preload: true,
  variable: '--font-ibm',
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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={ibmPlexSansThai.variable}>
      <body>
        <OfflineBar />
        {children}
      </body>
    </html>
  )
}
