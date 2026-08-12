import type { NextConfig } from "next";

// Two builds come out of this one project:
//   default      → the server on Vercel: API routes, /q for guests, SSR
//   BUILD_TARGET=app → a static export of the staff screens, packed into the
//                      Sunmi APK so the till opens without the network
const isAppBuild = process.env.BUILD_TARGET === 'app'

// Computed once per build. The service worker is registered with it, so a
// deploy always supersedes the previous worker and its cached pages.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)
  ?? String(Date.now())

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  generateBuildId: () => buildId,
  ...(isAppBuild
    ? {
        output: 'export' as const,
        distDir: '.next-app',
        images: { unoptimized: true },
        // Every API route is a `route.ts` and every screen is a `.tsx`, so
        // narrowing the extensions drops the server routes from this build
        // without moving a single file. They keep living on Vercel.
        pageExtensions: ['tsx'],
      }
    : {}),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.com',
      },
    ],
  },
  // ลด overhead ของ server-side logging ใน dev
  logging: {
    fetches: {
      fullUrl: false,
    },
  },

};

export default nextConfig;
