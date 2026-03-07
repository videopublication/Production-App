# Slide 1: High-Level System Architecture

## Purpose
To visualize how the application bridges the gap between unreliable field environments and a robust cloud backend, emphasizing the "Offline-First" nature.

## Visual Layout
*   **Layout:** Three-column "Layered" diagram.
*   **Left (Client/Field):** Mobile Device & Laptop icons.
*   **Center (Data Layer):** A large "Sync Engine" block.
*   **Right (Cloud):** Database & 3rd Party Services.

## Key Elements
1.  **Client Layer:**
    *   Next.js Client App.
    *   **Critical Node:** "IndexedDB (Offline Cache)" located *inside* the client device.
2.  **Middle Layer (The Bridge):**
    *   "Storage Service DAO" (The translator).
    *   "React Query Sync" (The motion/arrows).
3.  **Cloud Layer:**
    *   Supabase (PostgreSQL + Auth).
    *   Firebase Cloud Messaging.
    *   External APIs (WhatsApp Links).

## Labels / Callouts
*   **Arrow from Client to IndexedDB:** "Instant Read/Write (Zero Latency)"
*   **Arrow from IndexedDB to Cloud:** "Background Sync & Revalidation"
*   **Label on Storage Service:** "Normalization & Audit Logging"
*   **Label on Supabase:** "Single Source of Truth"

## AI Image Prompt
A professional, high-fidelity system architecture diagram in a flat modern tech style. White background. Three vertical zones. Left zone labeled "Client (Offline-Capable)", Middle zone "Synchronization Layer", Right zone "Cloud Infrastructure".
In the Client zone, show a sleek UI frame connected to a local database cylinder labeled "IndexedDB".
In the Middle zone, show a circular cycle arrow icon labeled "TanStack Query".
In the Cloud zone, show a hexagon labeled "Supabase" and a cloud icon labeled "Firebase".
Connecting lines should be clean, with solid lines for "Direct Access" and dotted lines for "Async Sync".
Use a color palette of Slate Blue, Emerald Green (for Sync), and Cool Gray. No cluttered text, minimal clean vector graphics.
