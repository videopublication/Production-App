export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FINANCE_MANAGER' | 'DATA_MANAGER' | 'CREW';

export type EquipmentStatus =
    | 'AVAILABLE'
    | 'CHECKED_OUT'
    | 'PENDING_VERIFICATION'
    | 'LOST'
    | 'DAMAGED'
    | 'MAINTENANCE';

export type Condition =
    | 'OK'
    | 'SCRATCHES'
    | 'NOT_FUNCTIONING'
    | 'NEEDS_BATTERY'
    | 'LOOSE_MOUNT'
    | 'DAMAGED';

export type EquipmentIssueType =
    | 'PHYSICAL_DAMAGE'
    | 'NOT_WORKING'
    | 'MISSING_ITEM_PART'
    | 'POWER_ISSUE'
    | 'CONNECTION_ISSUE'
    | 'OTHER';

export type EquipmentIssueSeverity =
    | 'MINOR'
    | 'USABLE_WITH_WARNING'
    | 'NOT_USABLE';

/**
 * Who has to sign off on a returned item before it can go out again.
 * - `none`     : a return reporting no issue goes straight back to AVAILABLE.
 * - `checkout` : returns wait, and the next person to check the item out confirms its
 *                condition — two different people, but no manager needed.
 * - `manager`  : returns wait for a manager; nobody else can clear them.
 * Items returned WITH a reported issue always wait for a manager, whatever the mode.
 */
export type ReturnVerificationMode = 'none' | 'checkout' | 'manager';

// Per-department configuration blob (jsonb `departments.settings`). Known keys are
// declared for type-safety; the index signature keeps it a free-form store so existing
// readers (department-labels.ts) and future keys keep working without a type change.
export interface DepartmentSettings {
    /** Defaults to 'none' when absent. */
    returnVerification?: ReturnVerificationMode;
    /** Which roles may use each bulk inventory tool. Absent tools fall back to the
     *  defaults in lib/tool-permissions. Keyed by ToolId. */
    toolPermissions?: Record<string, Role[]>;
    uiLabels?: Record<string, string>;
    labels?: Record<string, string>;
    whatsappEnabled?: boolean;
    whatsappGatewayUrl?: string;
    whatsappGroupJid?: string;
    whatsappApiKey?: string;
    whatsappInstanceName?: string;
    whatsappRules?: {
        checkoutAlerts?: boolean;
        returnAlerts?: boolean;
        shootReminders?: boolean;
    };
    [key: string]: unknown;
}

export interface Department {
    id: string;
    name: string;
    slug: string;
    enabledFeatures: string[]; // List of enabled feature slugs
    settings: DepartmentSettings;
}

export interface User {
    id: string;
    name: string;
    role: Role;
    email: string;
    phone?: string | null;
    whatsappNumber?: string | null;
    active?: boolean; // Deprecated, kept for immediate backward compat during refactor
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
    fcmToken?: string | null;
    avatarUrl?: string | null;
    departmentId?: string; // Initially optional during migration
    isPrimaryLeaveApprover?: boolean;
    canManageExpenses?: boolean;
    canBeAssignedToShoots?: boolean;
    canSelfEditProfile?: boolean;
    jiraToken?: string | null;
}

export interface Equipment {
    id: string;
    name: string;
    category: string;
    barcode: string;
    status: EquipmentStatus;
    location: string;
    condition: Condition;
    serialNumber?: string; // Manufacturer serial number
    metadata?: {
        brand?: string;
        model?: string;
        size?: string;
        // Connector/cable ends (structured, for filtering + auto name/barcode).
        endA?: string;
        endAGender?: 'M' | 'F' | '';
        endB?: string;
        endBGender?: 'M' | 'F' | '';
        serialNumber?: string;
        // Which team custodies this item. Absent = the camera-gear pool; 'DATA' = the
        // data team's own items (cards, hard disks, laptops, readers…). See lib/data-assets.
        custodian?: 'DATA';
        // Human card number ("22"), distinct from the scannable barcode ("CARD-22").
        cardNumber?: string;
        activeIssue?: {
            condition?: Condition;
            issueType?: EquipmentIssueType;
            severity?: EquipmentIssueSeverity;
            note: string;
            source: 'return' | 'verification' | 'manual' | 'crew_report';
            reportedAt?: string;
            reportedBy?: string;
            reporterName?: string;
            verifiedAt?: string;
            verifiedBy?: string;
            resolvedAt?: string;
            resolvedBy?: string;
            resolutionNote?: string;
        };
        [key: string]: unknown;
    };
    assignedTo?: string; // User ID
    lastActivity?: string; // ISO Date
    createdAt?: string; // ISO Date the item was added (from DB created_at, if present)
    departmentId?: string;
}

/**
 * Extra answers the data team needs that aren't derivable from the transaction itself.
 * Collected when data assets are returned. Kept as a small bag so more report questions
 * can be added without another migration.
 */
export interface TransactionDataReport {
    /** Was the Zoom recorder actually used on this shoot? Asked when cards come back. */
    zoomRecorderUsed?: boolean;
    answeredAt?: string;
    answeredBy?: string;
}

export interface Transaction {
    id: string;
    userId: string;
    items: string[]; // Equipment IDs
    manualItems?: ManualTransactionItem[];
    timestampOut: string;
    timestampIn?: string;
    project?: string;
    shootId?: string | null; // Link to assigned shoot
    preCheckoutConditions: Record<string, Condition>; // ItemID -> Condition
    postReturnConditions?: Record<string, Condition>;
    status: 'OPEN' | 'CLOSED';
    additionalUsers?: string[]; // IDs of other users involved
    notes?: string;
    departmentId?: string;
    dataReport?: TransactionDataReport;
}

export type ManualTransactionItemStatus =
    | 'OUT'
    | 'PENDING_VERIFICATION'
    | 'RETURNED'
    | 'MISSING';

export interface ManualTransactionItem {
    id: string;
    name: string;
    quantity: number;
    returnRequired: boolean;
    notes?: string;
    status: ManualTransactionItemStatus;
    returnedQuantity?: number;
    returnCondition?: Condition;
    issueType?: EquipmentIssueType;
    issueSeverity?: EquipmentIssueSeverity;
    returnNote?: string;
    returnedAt?: string;
    returnedBy?: string;
    verifiedAt?: string;
    verifiedBy?: string;
    /** Cleared by the returner rather than a manager (no issue reported). */
    selfVerified?: boolean;
}

export interface ReturnRecord {
    id: string;
    transactionId: string;
    itemId: string;
    timestampReturned: string;
    staffCondition: Condition;
    managerVerified: boolean;
    notes?: string;
}

export interface Log {
    id: string;
    action: 'CHECKOUT' | 'RETURN' | 'VERIFY' | 'EDIT' | 'CREATE' | 'DELETE' | 'LOGIN' | 'SIGNUP' | 'LOGOUT' | 'LOGIN_FAILED';
    entityId: string; // Item or Transaction ID
    userId?: string;
    timestamp: string;
    details?: string;
    oldValue?: unknown;
    newValue?: unknown;
    departmentId?: string;
}

export interface Notification {
    id: string;
    userId: string;
    title: string;
    message: string;
    link?: string;
    read: boolean;
    createdAt: string;
    departmentId?: string;
}

export type ShootStatus =
    | 'DRAFT'
    | 'OPEN'
    | 'WAITING_FOR_REQUESTER'
    | 'PENDING_PRODUCTION_SETUP'
    | 'READY_FOR_SHOOT'
    | 'CONFIRMED'
    | 'SHOOT_IN_PROGRESS'
    | 'ON_HOLD'
    | 'CLOSED'
    | 'CANCELLED';

export interface HumanResourceRequirement {
    roleName: string;
    count: number;
}

export interface ShootExpense {
    id: string;
    type: string;
    amount: number;
    campaign?: string;
}

export interface Shoot {
    id: string;
    title: string;
    description: string;
    location: string;
    status: ShootStatus;
    startTime: string;
    endTime?: string;
    pocName?: string;
    pocContact?: string;
    requiredRoles: HumanResourceRequirement[];
    createdBy: string;
    googleEventId?: string;
    cancellationReason?: string;
    shootNumber?: number;
    jiraTicketId?: string;
    departmentId?: string;
    expenses?: ShootExpense[];
    createdAt?: string;
}

export interface Assignment {
    id: string;
    shootId: string;
    userId: string;
    role: string;
    status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
    departmentId?: string;
}

export interface PlannerDraftAssignment {
    id: string;
    shootId: string;
    userId: string;
    role: string;
    createdBy?: string;
    createdAt: string;
    departmentId?: string;
}

export interface AssignmentSegment {
    id: string;
    assignmentId?: string | null;
    draftAssignmentId?: string | null;
    shootId: string;
    userId: string;
    startTime: string;
    endTime: string;
    role?: string;
    note?: string;
    createdBy?: string;
    createdAt?: string;
    departmentId?: string;
}

export interface Leave {
    id: string;
    userId: string;
    departmentId?: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    approverId?: string | null;
    createdAt?: string;
    updatedAt?: string;
}
