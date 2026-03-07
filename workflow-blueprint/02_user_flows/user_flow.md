# User Flow: The Crew Workflow

## Overview
The User (Crew) flow is mobile-first, focusing on "Getting the Gear" and "Doing the Job".

## 1. Verification & Dashboard
1.  **Login:** Phone number / Email auth.
2.  **Dashboard View:**
    *   "My Upcoming Shoots" (Next 48h).
    *   "Active Checkouts" (Gear currently in possession).

## 2. Check-Out Process (The "Cart" Flow)
1.  **Initiation:** User selects an approved "Shoot" from the dropdown.
2.  **Building the Kit:**
    *   Scans barcodes of items they are taking.
    *   Items appear in a "Cart".
3.  **Validation:**
    *   System checks if items are `Available` (not assigned to others).
    *   User signs digital signature (optional) or Confirms.
4.  **Completion:** Transaction created -> Items marked `In-Use`.

## 3. Return Process (The "Clean" Flow)
1.  **Return Mode:** User selects "Return Items".
2.  **Scanning:**
    *   User scans each item being returned.
    *   System verifies item belongs to an open transaction.
3.  **Verification:** Admin or Incharge verifies physically.
4.  **Close:** Transaction marked `Closed` -> Items marked `Available`.
