# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server with Turbopack (disables TLS verification)
npm run dev:beta     # Copy .env.beta → .env.local and run dev
npm run dev:prod     # Copy .env.production → .env.local and run dev
npm run build        # Production build (uses webpack, not Turbopack)
npm start            # Start production server
npm run lint         # Run ESLint
```

No test suite is configured.

## Architecture Overview

**VP App** is a Next.js 16 / React 19 progressive web app for video production management: equipment checkout/return, shoot scheduling, crew assignments, leave requests, and financial tracking.

### Tech Stack

- **Framework**: Next.js 16 App Router with TypeScript (strict mode)
- **Database & Auth**: Supabase (PostgreSQL + RLS + Realtime)
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Styling**: Tailwind CSS v4
- **Data Fetching**: React Query v5 with IndexedDB persistence (offline-first)
- **PWA**: `@ducanh2912/next-pwa` (Workbox) — disabled in development

### Provider Nesting Order

`src/app/layout.tsx` wraps the entire app:

```
QueryProvider → AuthProvider → DepartmentProvider → PreferencesProvider → AppLayout
```

- **QueryProvider** (`src/lib/query-provider.tsx`): React Query with IndexedDB persistence. `staleTime: 0`, `gcTime: 24h`. Cross-tab mutation invalidation via `window` events (`app-mutation`).
- **AuthProvider** (`src/lib/auth.tsx`): Supabase session management, real-time user status sync, redirects PENDING/SUSPENDED users to `/inactive`.
- **DepartmentProvider** (`src/lib/department-context.tsx`): Active department scope. Super Admins can set `null` for a "Global" view. Exposes `hasFeature(slug)` for per-department feature flags.
- **PreferencesProvider** (`src/lib/preferences-context.tsx`): Theme/accent/density stored in `localStorage` with `vpub_` prefix; applied as `data-*` attributes on `<html>`.

### Middleware (`src/middleware.ts`)

Auth + RBAC enforced at the edge. Fast path: reads JWT custom claims. Slow path (fallback): queries Supabase DB. Protects `/admin/*` routes to `ADMIN`/`SUPER_ADMIN` only. Public paths: `/`, `/login`, `/auth/callback`, `/inactive`, `/select-department`, `/api/departments`.

### Data Layer

- **`src/lib/storage.ts`** (33 KB): Single file containing all Supabase query functions for every entity — the primary data access layer.
- **`src/lib/supabase.ts`**: Browser Supabase client (uses `@supabase/ssr`).
- **`src/lib/supabase-admin.ts`**: Server-side admin client with service role key — only used in API routes.
- **`src/hooks/`**: React Query wrappers over `storage.ts` functions (e.g. `useShoots`, `useInventory`, `useTransactions`).

### Role System

Roles (defined in `src/types/index.ts`): `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `FINANCE_MANAGER`, `CREW`. Role is stored in the Supabase `users` table and embedded in JWT custom claims for middleware fast-path checks.

### Path Alias

`@/*` → `src/*` (configured in `tsconfig.json`).

### Key Integrations

- **Google Calendar** (`src/lib/google-calendar.ts`): Shoot scheduling sync
- **WhatsApp** (`src/lib/whatsapp.ts`): Crew notifications
- **Firebase Admin** (`src/lib/firebase.ts` + API routes): FCM push notifications
- **jsPDF / CSV**: Export from shoots and transactions pages
- **QR Scanner** (`src/components/QRScanner.tsx`): Equipment checkout via `html5-qrcode`

### Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_VAPID_KEY
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

No `.env.example` exists — reference `.env.local` directly.
