# System Architecture

## Architectural Patterns

### 1. Hybrid Client/Server Model
The application utilizes Next.js App Router to deliver a hybrid experience:
*   **Server Components (RSC):** Used for initial layout shell, metadata, and static shells to ensure fast First Contentful Paint (FCP).
*   **Client Components:** The majority of the application (`src/app/*`) runs as interactive Client Components to support the "Offline-First" architecture which relies heavily on browser APIs (IndexedDB, Service Workers).

### 2. The Storage Service (DAO Layer)
Direct database calls are abstracted away from the UI.
*   **Location:** `src/lib/storage.ts`
*   **Responsibility:**
    *   **Normalization:** Converts Supabase `snake_case` to App `camelCase`.
    *   **Business Logic:** Enforces rules like "Cannot return item if not part of transaction".
    *   **Audit Logging:** Automatically injects records into the `public.logs` table for every mutation.

### 3. Offline-First Data Layer
To support production environments (sets, basements) with poor connectivity:
*   **Primary Source of Truth (UI):** The IndexDB `OFFLINE_CACHE`.
*   **Synchronization:** TanStack Query handles background fetching.
*   **Policies:**
    *   `staleTime: 0` for operational data (Inventory, Transactions) to ensure freshness when connection exists.
    *   `gcTime: 24h` to allow full shift operation without internet.
    *   **Optimistic Mutations:** UI updates immediately; sync occurs in background.

### 4. Authentication Flow & Security
*   **Provider:** Supabase Auth (JWT).
*   **Session Security:**
    *   **Active Session Tracking:** Records `user_agent` vs `user_id` to detect account sharing.
    *   **RBAC Middleware:** Next.js Middleware protects routes based on `user_metadata.role`.
    *   **Real-time Kill Switch:** Subscriptions to `public.users` instantly log out suspended users.

### 5. Integration Architecture
*   **WhatsApp:** Client-side URL construction for deep-linking.
*   **Firebase / FCM:** Server-side trigger via `api/send-notification` -> Client-side Service Worker reception.
