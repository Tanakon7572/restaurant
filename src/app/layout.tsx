import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Food Order | ระบบสั่งอาหาร',
  description: 'ระบบจัดการเมนูและสั่งอาหารสำหรับร้านอาหาร',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        {children}
      </body>
    </html>
  )
}
