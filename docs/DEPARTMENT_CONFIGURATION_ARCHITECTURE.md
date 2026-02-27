# Department Configuration Architecture & Policy Engine
> **Objective**: Move from hardcoded business logic to a dynamic, configuration-driven "Policy Engine" that allows Super Admins to customize workflows (like checkout approvals, reporting access, etc.) per department.

## 1. The Core Concept: "Everything is a Setting"
Instead of writing `if (department === 'photo')`, we write `if (department.settings.requiresApproval)`. This makes the code agnostic to the department name and allows any department to opt-in/out of features.

### Proposed Schema Extension
We will formalize the `settings` JSON column in the `Department` table with a strictly typed interface.

```typescript
// src/types/settings.ts

export interface DepartmentSettings {
    inventory: InventoryPolicy;
    shoots: ShootPolicy;
    notifications: NotificationPolicy;
}

interface InventoryPolicy {
    // Workflow Control
    checkoutRequestMode: 'DIRECT' | 'APPROVAL_REQUIRED';
    
    // Who can approve? (If approval required)
    approvalRoles:  ('MANAGER' | 'ADMIN')[];
    
    // Granularity
    trackIndividualItems: boolean; // Future scale: Track specific serial numbers vs generic count
    
    // Constraints
    maxItemsPerCheckout?: number;
    requireReturnConditionCheck: boolean;
}

interface ShootPolicy {
    enableCalendarSync: boolean;
    requireManagerAssignment: boolean; // Crew cannot self-assign
}

interface NotificationPolicy {
    slackWebhookUrl?: string; // Integration capability
    notifyOnLowStock: boolean;
}
```

## 2. Architecture: The "Policy Gate" Pattern
We will introduce a `useDepartmentPolicy` hook on the frontend and a helper class on the backend to enforce these rules.

### Frontend: UX Adaptation
The UI will adapt based on the policy.
*   **Photo Dept (Strict)**: "Checkout" button becomes "Request Approval".
*   **Video Dept (Loose)**: "Checkout" button immediately creates an active transaction.

```tsx
// Example Component Hook
const { isAllowed, policy } = useDepartmentPolicy();

if (policy.inventory.checkoutRequestMode === 'APPROVAL_REQUIRED') {
    return <Button>Request Approval</Button>;
} else {
    return <Button>Checkout Now</Button>;
}
```

### Backend: Logic Enforcement
Before any write operation, the backend validates the action against the department's settings.

```typescript
// src/lib/transactions.ts (Pseudo-code)

async function createTransaction(deptId: string, items: string[]) {
    const dept = await getDepartment(deptId);
    
    if (dept.settings.inventory.checkoutRequestMode === 'APPROVAL_REQUIRED') {
        return db.insert({ status: 'PENDING_APPROVAL', ... });
    } else {
        return db.insert({ status: 'OPEN', ... });
    }
}
```

## 3. Scalability & Future Proofing
This JSON-based structure allows infinite extensibility without schema migrations.

*   **New Feature**: "We want to enforce QR scanning for returns."
    *   **Action**: Add `requireQrScan: boolean` to `DepartmentSettings`.
    *   **Result**: No database migration needed. Just a UI toggle.
*   **Integration**: "Connect Photo department to a specific Slack channel."
    *   **Action**: Add `slackWebhookUrl` to settings.
    *   **Result**: The Notification service checks this field dynamically.

## 4. Implementation Plan
1.  **Type Formalization**: Create `src/types/settings.ts` to define the configuration contract.
2.  **Settings UI**: Upgrade the Admin Department page to include a "Configuration" tab. This will be a dynamically generated form based on the settings schema (using switches/toggles).
3.  **Database Update**: Ensure existing departments have default settings (Migration script).
4.  **Logic Logic**: Refactor `Checkout` and `Transaction` flows to respect these settings.
