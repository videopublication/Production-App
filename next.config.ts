import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import path from "path";
import { fileURLToPath } from "url";

// ESM-safe project root. next.config.ts runs as an ES module under Next.js 16,
// so __dirname is not defined; derive it from import.meta.url instead.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: ({ request }) => request.destination === 'style' || request.destination === 'script' || request.destination === 'font',
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-resources',
          expiration: {
            maxEntries: 60,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
      {
        urlPattern: ({ request }) => request.destination === 'image',
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'images',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
      {
        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          cacheableResponse: {
            statuses: [0, 200],
          },
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 5 * 60, // 5 minutes
          },
        },
      },
    ],
  },
});



const nextConfig: NextConfig = {
  // Pin workspace root to this project — a stray package-lock.json in the
  // parent directory was making Next.js infer the wrong root, which broke
  // file tracing and Tailwind/PostCSS resolution on dev + Vercel builds.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    // Webpack dev mode was also resolving from the inferred parent root,
    // breaking `@import "tailwindcss"` in globals.css. Pin Turbopack's root too.
    root: projectRoot,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'html5-qrcode', 'lodash'],
  },
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/:serviceWorker(sw|firebase-messaging-sw).js',
        headers: [
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=*, microphone=*, geolocation=*, browsing-topics=()', // Adjusted: camera=* needed for QR scanner
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/admin/shoots',
        destination: '/shoots',
        permanent: true,
      },
      {
        source: '/admin/shoots/:path*',
        destination: '/shoots/:path*',
        permanent: true,
      },
    ];
  },
};

export default withPWA(nextConfig);

