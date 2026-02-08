# Project Context & Handoff (Feb 8, 2026)

This document summarizes the recent work on the Jira Integration, UI improvements, and Vercel configuration for the `vpapp-beta` branch. Use this context to resume development in the next session.

## 🚀 Recent Accomplishments

### 1. Jira Integration (Enhanced)
*   **Edge Function:** `supabase/functions/fetch-ticket-details` updated to fetch additional fields:
    *   `Event Venue`
    *   `Director of Photography` (mapped to Crew)
    *   `Event Start/End Dates`
    *   `POC Name` & `Contact`
*   **Security:** Function currently deployed with `--no-verify-jwt` to bypass frontend auth issues (temporary).
*   **Frontend:** `ShootForm.tsx` now parses the crew string from Jira matches them to existing App Users.

### 2. UI/UX Improvements
*   **Shoot Form:**
    *   Added a prominent "Import from Jira" card at the top.
    *   Converted "Shoot Title" and "Location" to auto-resizing textareas to prevent text cropping.
*   **Shoot Details (Mobile):**
    *   Action buttons (WhatsApp, Copy, Jira, Edit, Cancel) optimized for mobile.
    *   Layout: 6-column grid on mobile (3 items on top row, 2 on bottom).
*   **WhatsApp Formatting:**
    *   Added "Namaskaram" greeting.
    *   Includes Jira Ticket ID.
    *   Improved Location formatting.
    *   Conditionally hides "CREW ASSIGNED" section if empty.

### 3. Vercel & Environment Configuration
*   **Branch:** `vpapp-beta` is the active development branch.
*   **Database Isolation:** Successfully separated Production and Beta databases by configuring Vercel Environment Variables:
    *   **Production:** `NEXT_PUBLIC_SUPABASE_URL` (and others) scoped to **Production** environment only.
    *   **Beta (Preview):** New variables added with Beta values, scoped to **Preview** environment only.

## ⚠️ Known Issues & Technical Debt

1.  **Edge Function Security:**
    *   The `fetch-ticket-details` function is deployed with `--no-verify-jwt`.
    *   **Action:** Once the frontend `Auth check timed out` issue is fully resolved, redeploy the function *without* this flag to enforce JWT verification.

2.  **Auth Check Timeout:**
    *   The root cause of `Auth check timed out` in `src/lib/auth.tsx` is still under investigation. A revert was applied to `logout` logic to stabilize the Beta environment.
    *   **Action:** Debug the interaction between Supabase Auth and RLS policies on the `logs` table.

## 📝 Next Steps / Roadmap

1.  **Two-Way Jira Sync:**
    *   Currently, sync is One-Way (Jira -> App).
    *   **Goal:** Trigger updates to Jira ticket (e.g., assigning crew in App updates Jira field) using a new Edge Function.

2.  **Crew Notifications:**
    *   Automate WhatsApp/Email notifications to crew members when assigned to a shoot.

## 📂 Key Files Modified
*   `src/app/admin/shoots/[id]/page.tsx` (Mobile UI)
*   `src/components/ShootForm.tsx` (Jira Import UI)
*   `src/lib/whatsapp.ts` (Message Formatting)
*   `supabase/functions/fetch-ticket-details/index.ts` (Backend Logic)
*   `src/lib/auth.tsx` (Auth Logic)

---
**Status:** Stable on `vpapp-beta`.
**Database:** Beta DB (`uysumhukcopbnpmyxabw`)
