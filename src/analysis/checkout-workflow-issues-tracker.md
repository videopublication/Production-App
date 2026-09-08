# Checkout Workflow Issues & Improvement Tracker

This tracking document contains all identified bugs, architectural flaws, edge cases, and improvements in the equipment **Checkout Workflow**. It serves as a persistent checklist to review and mark off issues as they are resolved.

**Status Legend:**
- `[ ]` Open / Pending Investigation
- `[-]` In Progress
- `[x]` Resolved & Verified

---

## 📋 Quick Summary Table

| ID | Issue Title | Severity | Category | Status |
| :--- | :--- | :--- | :--- | :---: |
| **ISSUE-01** | Indiscriminate Crew Auto-Selection Destroys Custody | 🔴 High | Shoot Linking & Custody | `[x]` |
| **ISSUE-02** | Regular Crew "Blind Custody Hijack" in UI | 🔴 High | Shoot Linking & Custody | `[x]` |
| **ISSUE-03** | Retroactive Live Roster Drift Overwrites Past Checkout Snapshot | 🟠 Medium | Shoot Linking & Custody | `[x]` |
| **ISSUE-04** | Shoot Location Ignored During Checkout | 🟡 Low | Shoot Linking & Custody | `[x]` |
| **ISSUE-05** | Silent Error Swallowing in `saveTransaction` (Ghost Checkouts) | 🔴 High | Data Integrity & Concurrency | `[x]` |
| **ISSUE-06** | Concurrency Race Condition on Simultaneous Item Checkout | 🔴 High | Data Integrity & Concurrency | `[ ]` |
| **ISSUE-07** | Non-Atomic "Verify at Checkout" Prematurely Settles DB Records | 🟠 Medium | Data Integrity & Concurrency | `[ ]` |
| **ISSUE-08** | Stale `sessionStorage` Bypasses Issue & Maintenance Blocks | 🟠 Medium | Data Integrity & Concurrency | `[ ]` |
| **ISSUE-09** | WhatsApp Dispatch Omits `departmentId` (Bypasses Tenant Config) | 🔴 High | Multi-Tenancy & Notifications | `[x]` |
| **ISSUE-10** | WhatsApp Message Uses Incomplete Department Object for Labels | 🟡 Low | Multi-Tenancy & Notifications | `[x]` |
| **ISSUE-11** | Secondary Assignees Never Receive Push or In-App Notifications | 🟠 Medium | Multi-Tenancy & Notifications | `[x]` |
| **ISSUE-12** | Super Admin Global Checkout Creates Un-scoped Transactions | 🟠 Medium | Multi-Tenancy & Notifications | `[ ]` |
| **ISSUE-13** | Barcode Scanner Fails on Manufacturer Serial Numbers | 🟠 Medium | Scanning, UX & Device Handling | `[x]` |
| **ISSUE-14** | Permanent Submit Lockout on Browser Back Navigation | 🟠 Medium | Scanning, UX & Device Handling | `[x]` |
| **ISSUE-15** | iOS Safari `AudioContext` Silent Failure During Camera Scan | 🟡 Low | Scanning, UX & Device Handling | `[ ]` |
| **ISSUE-16** | Pull-To-Refresh Gesture Conflict with Long Cart Scrolling | 🟡 Low | Scanning, UX & Device Handling | `[ ]` |
| **ISSUE-17** | No In-Field Custody Transfer / Equipment Handover Mechanism | 🔴 High | Roster Changes & Handover | `[ ]` |
| **ISSUE-18** | Shoot Roster Changes Do Not Sync with Active Equipment Custody | 🔴 High | Roster Changes & Handover | `[ ]` |
| **ISSUE-19** | Phantom Gear Displayed in Replacement Crew's Returns Queue | 🟠 Medium | Roster Changes & Handover | `[x]` |
| **ISSUE-20** | Inability for Managers to Reassign Open Transaction Custody | 🟠 Medium | Roster Changes & Handover | `[x]` |
| **ISSUE-21** | Verbal / WhatsApp Crew Swaps Lock Out Physical Collectors | 🔴 High | Roster Changes & Handover | `[x]` |
| **ISSUE-22** | "On-Behalf" Checkouts Lack Receipt Confirmation / Acceptance | 🔴 High | On-Behalf Operations | `[ ]` |
| **ISSUE-23** | Admins / Managers Blocked from Returning "On-Behalf" Gear in `/returns` | 🔴 High | On-Behalf Operations | `[x]` |
| **ISSUE-24** | Performer Admin Omitted from WhatsApp Brief and In-App Details | 🟡 Low | On-Behalf Operations | `[x]` |
| **ISSUE-25** | Item History Timeline Polluted with Unrelated Equipment Events | 🔴 High | Item History & Audit | `[x]` |

---

## 1. Shoot Linking & Custody Attribution

- [x] **ISSUE-01: Indiscriminate Crew Auto-Selection Destroys Individual Custody**
  - **Description:** When linking a shoot, the system automatically pulls all shoot assignments and sets `selectedUserIds = uniqueIds`. The first element (`selectedUserIds[0]`) is assigned 100% of the gear in `equipment.assignedTo`. This arbitrarily assigns equipment to whoever was returned first by the DB (e.g. Director or PA) rather than who physically collected the items.
  - **Resolution:** Decoupled `collectorUserId` (physical custodian) from `additionalUserIds` (shoot team). Selecting a shoot auto-populates `additionalUserIds` for context and notifications without touching `collectorUserId`.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)
    - [src/hooks/useTransactions.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useTransactions.ts)

- [x] **ISSUE-02: Regular Crew "Blind Custody Hijack" in UI**
  - **Description:** The "Checkout For" user multi-select was hidden for users with the `CREW` role. When a crew member selected a shoot, their own ID was silently erased and replaced with the shoot roster.
  - **Resolution:** Added transparent custody card for `CREW` users showing `Picked up by: [User Name] (Myself)` with a "Primary Collector" status badge and linked shoot crew tags.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)

- [x] **ISSUE-03: Retroactive Live Roster Drift Overwrites Past Checkout Snapshot**
  - **Description:** In the transaction details view (`transactions/[id]`), the page dynamically computed the crew from live shoot assignments instead of the immutable snapshot stored at checkout.
  - **Resolution:** Prioritized `transaction.additionalUsers` snapshot on the transaction record. Live shoot changes no longer alter historical transactions.
  - **Affected Files:**
    - [src/app/transactions/[id]/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/transactions/%5Bid%5D/page.tsx)

- [x] **ISSUE-04: Shoot Location Ignored During Checkout**
  - **Description:** When a shoot with a set location was selected, `shoot.location` was not passed to `checkout()`, leaving equipment location set to warehouse shelves.
  - **Resolution:** Passed `location: selectedShoot?.location || undefined` to `checkout()` in `CheckoutPage`.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)
    - [src/hooks/useTransactions.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useTransactions.ts)

---

## 2. Data Integrity & Concurrency

- [x] **ISSUE-05: Silent Error Swallowing in `saveTransaction` (Ghost Checkouts)**
  - **Description:** `storage.saveTransaction` did not re-throw Supabase insert errors. If the insert failed, gear was marked checked out with no corresponding transaction row in the database.
  - **Resolution:** Updated `storage.saveTransaction` to re-throw database insertion errors, enabling caller recovery and preventing ghost checkouts.
  - **Affected Files:**
    - [src/lib/storage.ts](file:///c:/Users/aman.k/Music/Production-App/src/lib/storage.ts)

- [ ] **ISSUE-06: Concurrency Race Condition on Simultaneous Item Checkout**
  - **Description:** `updateEquipment` does not assert `status == 'AVAILABLE'` when checking out gear. If two users add the same physical item and checkout simultaneously, both transactions succeed, creating conflicting open transactions for the same item.
  - **Affected Files:**
    - [src/hooks/useTransactions.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useTransactions.ts)
    - [src/lib/storage.ts](file:///c:/Users/aman.k/Music/Production-App/src/lib/storage.ts)
  - **Risk:** Duplicate custody and broken check-in/return settlement.

- [ ] **ISSUE-07: Non-Atomic "Verify at Checkout" Prematurely Settles DB Records**
  - **Description:** When an item in `PENDING_VERIFICATION` is checked and confirmed, the mutation immediately releases the item to `AVAILABLE` and closes the previous transaction in the database. If the user subsequently abandons checkout, the previous transaction remains settled.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)
    - [src/hooks/useVerifyReturn.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useVerifyReturn.ts)
  - **Risk:** Premature database state transitions prior to checkout confirmation.

- [ ] **ISSUE-08: Stale `sessionStorage` Bypasses Issue & Maintenance Blocks**
  - **Description:** Cart state is restored from `sessionStorage` as raw serialized `Equipment[]` objects. If an item was marked `MAINTENANCE` or `NOT_USABLE` after being placed in the cart, reloading the tab allows the user to checkout the damaged gear without re-verifying against fresh database state.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)
  - **Risk:** Deployment of defective or unsafe equipment.

---

## 3. Multi-Tenancy & Notifications

- [x] **ISSUE-09: WhatsApp Dispatch Omits `departmentId` (Bypasses Tenant Config)**
  - **Description:** `sendWhatsAppGroupMessage(waMessage)` was invoked without passing `notificationDepartmentId`, causing cross-department leaks or bypassing department-specific gateways.
  - **Resolution:** Passed `notificationDepartmentId` to `sendWhatsAppGroupMessage`.
  - **Affected Files:**
    - [src/hooks/useTransactions.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useTransactions.ts)

- [x] **ISSUE-10: WhatsApp Message Uses Incomplete Department Object for Labels**
  - **Description:** `getDepartmentLabels` was called with `{ id: notificationDepartmentId } as any`, losing custom department terminology in WhatsApp messages.
  - **Resolution:** Retrieved full department object with settings to pass to `getDepartmentLabels`.
  - **Affected Files:**
    - [src/hooks/useTransactions.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useTransactions.ts)

- [x] **ISSUE-11: Secondary Assignees Never Receive Push or In-App Notifications**
  - **Description:** When checking out for multiple crew members, notifications were only dispatched to `selectedUserIds[0]`.
  - **Resolution:** Broadcasted in-app and push notifications to all crew members in `[userId, ...additionalUsers]`.
  - **Affected Files:**
    - [src/hooks/useTransactions.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useTransactions.ts)

- [ ] **ISSUE-12: Super Admin Global Checkout Creates Un-scoped Transactions**
  - **Description:** When a Super Admin checks out gear without an active department filter, `filterDeptId` is `undefined`, writing `department_id: null`. Department Managers querying by their own department ID cannot see these transactions.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)
    - [src/hooks/useTransactions.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useTransactions.ts)
  - **Risk:** Equipment leaves the department without appearing in the manager's active transaction view.

---

## 4. Scanning, UX & Device Handling

- [x] **ISSUE-13: Barcode Scanner Fails on Manufacturer Serial Numbers**
  - **Description:** `processBarcode` only checked `item.barcode` and `item.id`, failing on manufacturer serial number barcodes.
  - **Resolution:** Added `(i.serialNumber && i.serialNumber.toLowerCase() === normalizedBarcode.toLowerCase())` in `processBarcode`.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)

- [x] **ISSUE-14: Permanent Submit Lockout on Browser Back Navigation**
  - **Description:** `isSubmittingRef.current = true` was never reset to `false` in `handleSuccess`, locking out the user on back navigation.
  - **Resolution:** Added `isSubmittingRef.current = false;` in `handleSuccess`.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)

- [ ] **ISSUE-15: iOS Safari `AudioContext` Silent Failure During Camera Scan**
  - **Description:** New `AudioContext` instances default to `suspended` on iOS Safari unless unlocked inside a direct user gesture. Camera detection callbacks are asynchronous, causing scan audio and haptic feedback to silently fail on iPhones.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)
  - **Risk:** Degraded feedback loop on mobile PWA deployments.

- [ ] **ISSUE-16: Pull-To-Refresh Gesture Conflict with Long Cart Scrolling**
  - **Description:** `PullToRefresh` wraps the entire mobile layout. Scrolling back up inside a long cart list can trigger a full-page reload, discarding ongoing scanning state.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)
  - **Risk:** Accidental page resets during high-volume equipment checkout.

---

## 5. Roster Changes & In-Field Handover

- [ ] **ISSUE-17: No In-Field Custody Transfer / Equipment Handover Mechanism**
  - **Description:** If crew member A takes gear out, and crew member B replaces them on set, there is no in-field peer-to-peer custody transfer mechanism.
  - **Affected Files:**
    - System-wide gap across `src/app/transactions/` and `src/app/shoots/`.
  - **Risk:** Chain of custody breaks down completely during crew substitutions; original crew member is blamed for damage that occurred under replacement crew.

- [ ] **ISSUE-18: Shoot Roster Changes Do Not Sync with Active Equipment Custody**
  - **Description:** Updating shoot assignments in `src/app/shoots/[id]` has zero hooks or side-effects on open transactions or equipment table rows.
  - **Affected Files:**
    - [src/lib/storage.ts](file:///c:/Users/aman.k/Music/Production-App/src/lib/storage.ts)
    - [src/hooks/useAssignments.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useAssignments.ts)
  - **Risk:** Desynchronization between shoot management and asset management.

- [x] **ISSUE-19: Phantom Gear Displayed in Replacement Crew's Returns Queue**
  - **Description:** The returns view (`/returns`) dynamically granted return permissions to any user assigned to the shoot, showing phantom items.
  - **Resolution:** Refactored `/returns` page filtering so both primary collectors (`isPrimary`), shoot working crew (`isAdditional`), and active shoot assignees can return gear, while allowing managers/admins to process returns for any open department transactions.
  - **Affected Files:**
    - [src/app/returns/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/returns/page.tsx)

- [x] **ISSUE-20: Inability for Managers to Reassign Open Transaction Custody**
  - **Description:** In `src/app/transactions/[id]`, managers could not edit `userId` or `additionalUsers` on an open transaction.
  - **Resolution:** Added Primary Custodian and Additional Crew editor in the transaction details modal with automatic sync to `equipment.assignedTo` when open.
  - **Affected Files:**
    - [src/app/transactions/[id]/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/transactions/%5Bid%5D/page.tsx)

- [x] **ISSUE-21: Verbal / WhatsApp Crew Swaps Lock Out Physical Collectors**
  - **Description:** When crew was verbally swapped at the last minute, linking the shoot pulled outdated database assignments, erasing the actual collector.
  - **Resolution:** The physical collector remains the logged-in crew member. Linking a shoot populates `additionalUsers` without erasing the collector. Shows an on-set collector badge and permits returns at wrap time.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)
    - [src/app/returns/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/returns/page.tsx)

---

## 6. On-Behalf Operations (Manager / Admin Checkout)

- [ ] **ISSUE-22: "On-Behalf" Checkouts Lack Receipt Confirmation / Acceptance**
  - **Description:** When an admin checks out gear to a crew member (who may be offsite or traveling), custody in `equipment.assignedTo` immediately transfers without requiring the crew member's acknowledgment or digital signature.
  - **Affected Files:**
    - [src/hooks/useTransactions.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useTransactions.ts)
  - **Risk:** Disputed liability and lack of two-way verification during indirect handoffs.

- [x] **ISSUE-23: Admins / Managers Blocked from Returning "On-Behalf" Gear in `/returns`**
  - **Description:** The `/returns` page filtered items strictly by `txn.userId === user.id` or `assignment.userId === user.id`. Warehouse admins could not scan-to-return gear checked out on behalf of crew.
  - **Resolution:** Added role-based bypass in `returns/page.tsx` for `['ADMIN', 'MANAGER', 'SUPER_ADMIN']`.
  - **Affected Files:**
    - [src/app/returns/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/returns/page.tsx)

- [x] **ISSUE-24: Performer Admin Omitted from WhatsApp Brief and In-App Details**
  - **Description:** The WhatsApp checkout brief formatted team as `Taken By: [Assignees]`, omitting who physically authorized or performed the checkout.
  - **Resolution:** Updated `buildCheckoutMessage` to accept `performerId` and explicitly separate `*Handed Over By:*`, `*Collected By:*`, and `*Shoot Crew:*`. Updated in-app notification messages to include performer name.
  - **Affected Files:**
    - [src/lib/transaction-message.ts](file:///c:/Users/aman.k/Music/Production-App/src/lib/transaction-message.ts)
    - [src/hooks/useTransactions.ts](file:///c:/Users/aman.k/Music/Production-App/src/hooks/useTransactions.ts)

---

## 7. Item History & Audit

- [x] **ISSUE-25: Item History Timeline Polluted with Unrelated Equipment Events**
  - **Description:** In `src/app/inventory/[id]/page.tsx`, the item history timeline was pulling unrelated equipment logs (e.g. `Sony Fx6 Camera (CAM-FX6-1)` appearing inside `CAM-FX3-3`'s history). This occurred because:
    1. A generic regex matched names in rename logs like `Renamed "Camera" → "Sony Fx3 Camera"` and added the word `"camera"` to `knownBarcodes`.
    2. Parenthetical expressions like `(Thevaram)` in shoot names were parsed as barcodes.
    3. Any transaction log containing the word "camera" (e.g. force-returning other cameras in multi-item transactions) matched the regex and was injected into this camera's history.
  - **Resolution:**
    1. Restricted `knownBarcodes` strictly to `item.barcode`, `item.serialNumber`, and verified barcode changes (`Generated barcode for...`).
    2. Filtered transaction-level return/verify logs strictly to those matching this specific item's ID, barcode, or serial number.
    3. Sorted `relatedTxns` descending by `timestampOut` so usage stats reflect the latest transaction.
  - **Affected Files:**
    - [src/app/inventory/[id]/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/inventory/%5Bid%5D/page.tsx)

- [x] **ISSUE-26: Prioritize Immutable `item.id` over Barcodes/Serial in QR Scanning & Audit Logs**
  - **Description:** Barcodes and serial numbers can change (re-tagging, barcode regeneration, serial corrections), but `item.id` (UUID) is permanent. The system previously prioritized `barcode` over `id` during QR scans (`data.barcode || data.id`), omitted `item.id` from search in verification, and saved transaction force-return logs without direct `item.id` entity references.
  - **Resolution:**
    1. Switched QR scan parsing to `data.id || data.barcode` across checkout, inventory, verification, and transaction pages.
    2. Added `item.id` matching to verification page search filtering.
    3. Added direct item-level audit logs (`entityId: item.id`) and structured `{ itemId: item.id }` metadata to force-return actions on the transaction page.
  - **Affected Files:**
    - [src/app/checkout/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/checkout/page.tsx)
    - [src/app/verification/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/verification/page.tsx)
    - [src/app/inventory/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/inventory/page.tsx)
    - [src/app/transactions/[id]/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/transactions/%5Bid%5D/page.tsx)

- [x] **ISSUE-27: Activity Logs Inability to Search or View Checked-Out Items**
  - **Description:** In `/admin/logs`, searching for an item name (`fx3`), barcode (`CAM-FX3-3`), or serial number returned "No logs found" when filtering by `CHECKOUT`. Checkout logs stored high-level summary strings in `details` (e.g. `Checked out 26 inventory items for...`), while specific items were stored inside the JSONB `new_value->itemNames`. `storage.getLogs` only searched `details`, `action`, and `entity_id`. Furthermore, the UI only displayed `details`, preventing administrators from inspecting which items were checked out.
  - **Resolution:**
    1. Upgraded `storage.getLogs` to query `new_value->>itemNames`, `new_value->>addedItemNames`, `new_value->>itemIds`, and dynamically resolve equipment (by serial number, barcode, name) and users into the search query.
    2. Enhanced `/admin/logs` UI on both desktop and mobile:
       - Displays matched items prominently when a search is active.
       - Added an expandable toggle (`View X items`) with badge chips for every item checked out.
  - **Affected Files:**
    - [src/lib/storage.ts](file:///c:/Users/aman.k/Music/Production-App/src/lib/storage.ts)
    - [src/app/admin/logs/page.tsx](file:///c:/Users/aman.k/Music/Production-App/src/app/admin/logs/page.tsx)


