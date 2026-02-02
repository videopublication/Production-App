# Scaling Strategy: Multi-Department Architecture

**Objective**: Evolve the current "Video Pub" application into a flexible platform capable of supporting multiple departments with varying workflows and feature requirements, without maintaining separate codebases.

---

## 1. Core Architecture: Multi-Tenancy
**Recommendation**: Use a **Single Database, Single Application** approach (Multi-Tenant SaaS), rather than forking/copying the code.

### Why?
- **Maintenance**: Fix a bug once, everyone gets the fix.
- **Speed**: Onboard a new department in minutes, not days.
- **Consistency**: Unified UI and experience across the university/organization.

---

## 2. Database Changes (Data Isolation)
To support multiple departments in one database, we must partition data logically using an `organization_id`.

### New Table: `organizations`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `name` | Text | Display name (e.g., "Video Pub", "IT Dept") |
| `slug` | Text | Unique conceptual ID (e.g., `video-pub`) |
| `settings` | JSONB | **Crucial**: Stores feature flags (see Section 3) |
| `created_at` | Timestamp | |

### Updates to Existing Tables
Add `organization_id` (Foreign Key) to **all** data tables:
- `users`
- `equipment`
- `transactions`
- `shoots`
- `assignments`
- `logs`
- `notifications`

### Security Layer (Supabase RLS)
Update Row Level Security policies to strictly enforce boundaries.
*   **Current**: `SELECT * FROM equipment` (User sees everything)
*   **New**: `SELECT * FROM equipment WHERE organization_id = auth.user_organization_id()`
*   *Note*: This requires storing the user's `organization_id` in `auth.users` metadata or a joined profile table reachable by RLS.

---

## 3. Customization Engine (Feature Flags)
Different departments have different needs. do NOT hardcode these checks. Use the `settings` JSONB column in the `organizations` table.

**Example `settings` JSON:**
```json
{
  "features": {
    "shoots": false,           // This dept doesn't do video shoots
    "calendar": false,         // They don't need the calendar view
    "verification": true,      // They only want simple check-in/out
    "approvals": {
      "require_manager": true  // Workflow customization
    }
  },
  "labels": {
    "shoot": "Event",          // Rename "Shoot" to "Event" in UI
    "crew": "Staff"
  },
  "theme": {
    "primary_color": "#0071e3" // Optional branding
  }
}
```

---

## 4. Frontend Implementation Strategy
The React/Next.js code will remain unified but adaptable.

### 1. Global Context (`useOrganization`)
Create a provider that loads the current user's organization settings on login.

### 2. Feature Guards
Wrap components in permission checks:
```tsx
// Example: Navigation Bar
{settings.features.shoots && (
  <NavItem href="/shoots" label={settings.labels.shoot || 'Shoots'} />
)}
```

### 3. Dynamic Workflows
Adapt logic based on settings:
```tsx
// Example: Checkout Button
const handleCheckout = () => {
  if (settings.features.approvals.require_manager) {
    // Logic A: Create PENDING request
    createRequest(items);
  } else {
    // Logic B: Immediate Checkout
    processCheckout(items);
  }
};
```

---

## 5. Implementation Roadmap phases

### Phase 1: Foundation
1.  Create `organizations` table.
2.  Link `users` to `organizations`.
3.  Migrate existing data to a default "Video Pub" organization.

### Phase 2: Security & RLS
1.  Add `organization_id` to all tables.
2.  Update all RLS policies to filter by `organization_id`.
3.  Verify that User A cannot fetch User B's data via API.

### Phase 3: The "Settings" Engine
1.  Build the `settings` JSON structure.
2.  Create a helper in frontend code (`useOrgSettings`) to read these flags.
3.  Hide the "Shoots" page if the flag is disabled.

### Phase 4: Workflow Customization
1.  Implement specific logic branches (e.g., Approval flows) based on flags.
2.  Allow customizable labels (e.g., "Shoot" vs "Event").

---

## 6. Migration Plan for Existing Data
Since you already have live data:
1.  Create the default organization "Video Pub".
2.  Run a script to update **all** existing rows in every table to have the `organization_id` of "Video Pub".
3.  Enable the new RLS policies.
4.  *Result*: The app behaves exactly as it does now, but is ready for Tenant #2.
