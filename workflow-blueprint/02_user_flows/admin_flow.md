# Admin Flow: Workflow & Capabilities

## Overview
The Admin is the "Inventory Commander". Their flow focuses on high-level organization, asset integrity, and personnel management.

## 1. Inventory Onboarding
1.  **Creation:** Admin scans manufacturers barcode or generates a system asset tag.
2.  **Metadata Entry:** Enters Model, Category, Serial, and Purchase Date.
3.  **Status Set:** Marks as `Available`.

## 2. Shoot Scheduling (The Assignment Flow)
1.  **Create Shoot:**
    *   Defines Title, Location, Start/End Time.
    *   **Critical:** Defines `Required Roles` (e.g., "1x Cam Op, 1x Sound").
2.  **Crew Assignment:**
    *   UI shows "Empty Slots" based on requirements.
    *   Admin clicks a slot -> select User from roster.
    *   System checks for conflicts (already booked on another shoot?).
3.  **Dispatch:**
    *   Click "Share on WhatsApp".
    *   System generates formatted brief.
    *   Admin sends to Crew Group.

## 3. Transaction Oversight
*   **Force Returns:** Can bypass the "Scan Requirement" in emergencies to close transactions.
*   **Audit:** Viewing the "Activity Feed" to see who broke what item.
