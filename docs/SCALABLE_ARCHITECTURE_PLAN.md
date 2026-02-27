# Scalable Multi-Tenant Architecture Plan

## Executive Summary
To support multiple departments (Video Production, Marketing, Graphics, etc.) within a single application instance, we will adopt a **Multi-Tenant Architecture with Modular Feature Flags**. 

This allows us to maintain a single codebase and database while offering a tailored experience for each department.

---

## 1. Database Architecture (The "Tenant" Model)

We will introduce a `departments` table (the "Tenant") and link all core entities to it.

### New Table: `departments`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key |
| `name` | `text` | e.g., "Video Production", "Marketing" |
| `slug` | `text` | e.g., "vp-dept", "marketing" (for URLs) |
| `settings` | `jsonb` | Theme colors, custom labels, notification preferences |
| **`enabled_features`** | **`jsonb`** | **Critical:** List of modules enabled for this department |

**Example `enabled_features` JSON:**
```json
// Video Production Department
["inventory", "shoots", "crew_management", "calendar"]

// Graphics Department
["project_requests", "calendar", "asset_library"]
```

### Updates to Existing Tables
Existing tables (`users`, `shoots`, `inventory_items`) will get a `department_id` column.

*   **Row Level Security (RLS):** Policies will be updated to enforce strict isolation.
    *   *Rule:* A user can only access rows where `table.department_id == user.department_id`.

---

## 2. Handling "Different Features" (Feature Flags)

We solve the "divergent requirements" problem using a **Modular Feature System**.

### A. The "Core" vs. "Modules"
*   **Core (Everyone gets this):** Authentication, User Management, Notifications, Basic Settings.
*   **Modules (Toggleable):**
    *   `Inventory`: Equipment checkout/checkin (Heavy usage by VP, maybe IT).
    *   `Shoots`: Call sheets, logistics (VP only).
    *   `Requests`: Ticket-based work tracking (Graphics, Marketing).
    *   `Assets`: File management (Graphics).

### B. Frontend Implementation
We will implement a `FeatureGuard` system in the React/Next.js layer.

**1. Dynamic Sidebar:**
Instead of hardcoding the sidebar, it renders based on the user's department config.

```typescript
// Conceptual Code
const sidebarItems = [
  { label: 'Shoots', icon: Camera, feature: 'shoots' },
  { label: 'Inventory', icon: Box, feature: 'inventory' },
  { label: 'Requests', icon: Ticket, feature: 'requests' }
];

// In Component
{sidebarItems.map(item => (
  user.department.features.includes(item.feature) && <SidebarItem ... />
))}
```

**2. Page Protection:**
If a Marketing user tries to visit `/admin/inventory`, the `withFeature('inventory')` higher-order component will block them and redirect to 404 or Dashboard.

---

## 3. Migration Strategy

To transition from the current "Single Dept" app to "Multi-Dept":

1.  **Refactor Phase:**
    *   Create `departments` table.
    *   Create a "Default" department (Video Production).
    *   Run a script to assign ALL existing users and data to this Default department.
    *   Turn on RLS policies.

2.  **Feature Flagging Phase:**
    *   Wrap `Shoots` pages in a `shoots` feature flag.
    *   Wrap `Inventory` pages in an `inventory` feature flag.
    *   Enable all flags for the 'Video Production' department.

3.  **Onboarding Phase:**
    *   Create the "Marketing" department.
    *   Enable only `['requests', 'calendar']` for them.
    *   Invite Marketing users.

---

## 4. Why This is "Pro" / Scalable
1.  **Code Consistency:** You fix a bug in the "Calendar" module, and *every* department benefits.
2.  **Configuration over Code:** Launching a new department takes 5 minutes (DB insert), not 5 hours (coding/deploying).
3.  **Cross-Dept Collaboration:** Because they are in the *same* DB, in the future, you can easily build features like "Marketing requests a Shoot from Video Production" (Cross-tenant workflows).
