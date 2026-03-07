# Error Handling & Edge Cases

## 1. Network Failure (The Tunnel Scenario)
*   **Scenario:** User scans item in a basement without signal.
*   **Handling:**
    1.  Request Queued in `MutationCache`.
    2.  UI Optimistically updates (Item shows "In Cart").
    3.  User leaves basement -> Connection Restored.
    4.  `RefetchOnReconnect` triggers -> Data syncs to Supabase.

## 2. Concurrent Access (The Double-Book Scenario)
*   **Scenario:** Two users try to scan the same lens for different shoots simultaneously.
*   **Handling:**
    1.  User A hits "Confirm". Database updates Status -> `IN_USE`.
    2.  User B hits "Confirm". Database Transaction fails (Constraint Violation: Item not `AVAILABLE`).
    3.  User B receives Toast Error: "Item X is no longer available".
    4.  Auto-refetch updates User B's view.

## 3. Data Corruption (The Cache Wipe)
*   **Scenario:** IndexedDB enters invalid state.
*   **Handling:**
    1.  `StorageService` detects schema mismatch.
    2.  Triggers `persister.bust()`.
    3.  Force-reloads application to fetch fresh snapshot from Supabase.
