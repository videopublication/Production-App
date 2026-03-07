# API Lifecycle & Backend Services

## 1. The Supabase Backend
The "Backend" is primarily a "Serverless Functions + Database" architecture.

### API Routes (`src/app/api/`)
*   **`GET /api/public/calendar`**:
    *   Generates ICS feeds for external calendar subscription.
    *   Protected by shared secret token.
*   **`POST /api/admin/invite`**:
    *   Uses `service_role` to bypass public auth and create user accounts programmatically.
*   **`POST /api/send-notification`**:
    *   Integration point for Firebase Cloud Messaging.
    *   Accepts `userId`, `title`, `body`.

## 2. Request Lifecycle
1.  **Client Request:** React Query initiates fetch.
2.  **The Guard (Middleware):** `middleware.ts` intercepts. Checks `sb-access-token` cookie.
3.  **The Database (Supabase):** RLS (Row Level Security) policies apply automatically based on `auth.uid()`.
    *   Example: `SELECT * FROM transactions WHERE user_id = auth.uid()`
4.  **Response:** JSON data returned to Client.

## 3. Caching Strategy (Backend)
*   **Static Data:** Icon sets and Manifests are generated at build time.
*   **Dynamic Data:** API responses are generally *not* cached by Vercel Edge Cache to ensure real-time inventory accuracy, relying instead on the Client Side (IndexedDB) cache.
