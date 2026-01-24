# Professional PWA & Caching Audit

## 🚀 Executive Summary
The application currently uses a robust "Offline-First" architecture combining Service Workers (via `next-pwa`) for asset caching and `TanStack Query` + `IndexedDB` for data persistence. This is a high-quality setup, but there are specific areas for improvement in **accessibility**, **robustness**, and **device detection**.

---

## 📋 Actionable Todo List

### 1. 📱 Accessibility & User Experience
- [x] **Fix Viewport Zoom** (`src/app/layout.tsx`)
  - **Issue:** `userScalable: false` is an accessibility anti-pattern. It prevents users with visual impairments from pinch-zooming.
  - **Fix:** Remove this property or set it to `true`.
- [ ] **Consistent Styling** (`src/components/PWAInstallPrompt.tsx`)
  - **Issue:** Uses hardcoded hex values (`bg-[#1c1c1e]`) instead of design system tokens.
  - **Fix:** Refactor to use Tailwind classes (e.g., `bg-neutral-900`, `border-neutral-800`) to ensure theming consistency.

### 2. 🍎 iOS & Device Detection
- [x] **Robust iPad Detection** (`src/components/PWAInstallPrompt.tsx`)
  - **Issue:** Regex `/iphone|ipad|ipod/` fails on modern iPads, which report as Macintosh Intel in Safari.
  - **Fix:** Add `navigator.maxTouchPoints > 2` check to correctly identify iPads.

### 3. 🛡️ Data & Caching Robustness
- [ ] **Stale Data Handling** (`src/lib/query-provider.tsx`)
  - **Observation:** `refetchOnWindowFocus: false` is set.
  - **Recommendation:** specific queries (like "Active Shoots" or "Inventory Status") should probably override this to `true` to ensure dispatchers see real-time updates when switching apps.
- [x] **Emergency Cache Clear** (New Feature)
  - **Issue:** With aggressive Service Worker + IndexedDB caching, bad deployments can sometimes get "stuck".
  - **Fix:** Implement a hidden or settings-based "Hard Reset" button that unregisters SWs and clears IndexedDB (using `idb-keyval` `clear`).

### 4. ⚙️ Configuration
- [x] **Manifest Orientation** (`public/manifest.json`)
  - **Issue:** `orientation: "portrait-primary"` locks tablets and desktop PWAs awkwardly.
  - **Fix:** Change to `any` or `natural` unless portrait is strictly required by the UI design (which should be responsive anyway).

---

## 🔍 Detailed Code Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| **Service Worker** | ✅ **Excellent** | Uses `NetworkFirst` for API and `StaleWhileRevalidate` for assets. Correctly excludes `/api/` from aggressive static caching. |
| **Data Persistence** | ✅ **Excellent** | `AsyncStoragePersister` with `IndexedDB` is the gold standard for large datasets (better than localStorage). |
| **Install Prompt** | ⚠️ **Good** | Solid logic, but needs the iPad fix mentioned above. |
| **Offline Fallback** | ℹ️ **Note** | Ensure there are visual indicators when the app is in "Offline Mode" so users know their changes are local-only until reconnection. |
