# Slow Network & Offline Capability Audit

This audit identifies potential issues with the application's performance and usability on slow or unstable networks ("flaky wifi", "subway mode") and provides a prioritized todo list.

## 🚨 Critical Issues (Immediate Fixes)

### 1. Blocking UI on Data Fetch
- **Issue**: Several pages (Dashboard, Admin) rely on `isLoading` flags that completely remove the UI and show a spinner. This prevents users from seeing "stale" but useful data while updates happen in the background.
- **Fix**: 
    - Implement **Skeleton Loaders** that mimic the layout to reduce layout shift.
    - Keep displaying existing data (stale) while fetching new data (`isFetching` vs `isLoading`), only showing a small spinner indicator (e.g., in the header) instead of blocking the screen.

### 2. Manual Data Fetching Consistency
- **Issue**: The `CalendarPage` manually calls `storage.get...()` in a `useEffect`. This bypasses the caching, deduping, and background refetching logic provided by `react-query` hooks used elsewhere.
- **Fix**: Refactor `CalendarPage` to use `useShoots`, `useAssignments`, and `useUsers` hooks. This ensures that if the Shoots page updates the cache, the Calendar page reflects it instantly without a network call.

### 3. Lack of Optimistic Updates
- **Issue**: Actions like "Check Out", "Return", or "Verify" wait for the server to respond before updating the UI. On a slow network, this feels sluggish (e.g., verifying an item takes 2 seconds to "disappear" from the list).
- **Fix**: Implement `onMutate` in `react-query` mutations to instantly update the local cache. If the server request fails, roll back the change.

### 4. Search & Filter Latency
- **Issue**: Search inputs often rely on client-side filtering of *all* data. While fast for small datasets, if the initial load is slow, the search is unusable.
- **Fix**: Ensure search inputs are responsive immediately even if background data is refreshing.

## 🛠️ Enhancements (Pro Polish)

### 5. Offline Actions Queue
- **Issue**: If a user tries to "Check Out" while offline, the request fails.
- **Fix**: Implement a specialized "Offline Mutation Queue" (using `persist-client` or custom logic) to store actions (checkout, verify) in `localStorage` and replay them when back online.

### 6. Background Sync & Revalidation
- **Issue**: The app relies on "focus" refetching. 
- **Fix**: Tune `staleTime` and `gcTime` strategies. For critical inventory, `staleTime` should be low (0-1 min). For static data (Users), it can be higher (30 mins). Use `refetchInterval` for dashboard stats if they must be live.

### 7. Image Optimization
- **Issue**: If item images are large, they clog the bandwidth.
- **Fix**: Ensure `next/image` is used effectively with proper caching policies in `next.config.ts`.

## ✅ Todo List

- [x] **Add Pull-to-Refresh**: implemented in Calendar and Shoots list to allow user-triggered updates.
- [ ] **Refactor Calendar Fetching**: Switch `CalendarPage` to use `useShoots` hooks.
- [ ] **Standardize Loading**: Replace full-screen spinners with Skeletons in `Dashboard` and `ShootList`.
- [ ] **Optimistic UI**: Add optimistic updates to `useInventory` (Verify/Return) and `useShoots` (Create/Edit).
- [ ] **Offline Queue**: Research and implement `tanstack/query-persist-client-core` or similar for offline mutation resilience.
