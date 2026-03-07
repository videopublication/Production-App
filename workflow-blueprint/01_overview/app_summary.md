# App Summary: Production Inventory Management System

## System Identity
**Type:** SaaS / PWA (Internal Enterprise Tool)
**Core Domain:** Media Production Logistics & Equipment Management
**Primary Goal:** To eliminate equipment loss and streamline shoot logistics by enforcing a rigid "Chain of Custody" via barcode scanning, while providing a seamless, "Apple-style" user experience for creative teams.

## High-Level Capabilities
1.  **Inventory Intelligence:**
    *   Real-time tracking of camera gear, lenses, and lighting.
    *   State tracking: `Available`, `Booked`, `In-Use`, `Maintenance`, `Lost`.
    *   Barcode-based identification (Manufacturer Serial & System Generated).

2.  **Shoot & Logistics Management:**
    *   Project scheduling with role-based crew assignments.
    *   Automatic conflict detection for gear and personnel.
    *   WhatsApp integration for instant crew dispatchs.

3.  **Transaction Lifecycle:**
    *   **Check-Out:** Scan-to-assign workflow linking Gear -> Shoot -> User.
    *   **Verified Returns:** Mandatory visual verification upon return to close transactions.

4.  **Resilient Architecture:**
    *   **Offline-First:** Full read/write capability in dead zones via IndexedDB & React Query.
    *   **Real-Time Sync:** Optimistic updates with background reconciliation.

## User Roles
*   **Admin (Inventory Manager):** Full access to create items, manage users, force-check-in items, and view audit logs.
*   **User (Producer/Crew):** Can view inventory, request bookings, manage their assigned shoots, and perform self-check-outs (if enabled).

## Tech Stack Highlights
*   **Frontend:** Next.js 14, TypeScript, Tailwind CSS (Custom Design System).
*   **Backend:** Supabase (PostgreSQL + Auth), Next.js API Routes.
*   **Persistence:** IndexedDB (idb-keyval), TanStack Query V5.
*   **Integrations:** Firebase (FCM Notifications), WhatsApp (Deep Linking), Google Calendar.
