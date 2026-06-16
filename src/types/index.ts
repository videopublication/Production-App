export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FINANCE_MANAGER' | 'CREW';

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

export interface Department {
    id: string;
    name: string;
    slug: string;
    enabledFeatures: string[]; // List of enabled feature slugs
    settings: Record<string, any>;
}

export interface User {
    id: string;
    name: string;
    role: Role;
    email: string;
    active?: boolean; // Deprecated, kept for immediate backward compat during refactor
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
    fcmToken?: string | null;
    avatarUrl?: string | null;
    departmentId?: string; // Initially optional during migration
    isPrimaryLeaveApprover?: boolean;
    canManageExpenses?: boolean;
    canBeAssignedToShoots?: boolean;
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
        serialNumber?: string;
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
    departmentId?: string;
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
    action: 'CHECKOUT' | 'RETURN' | 'VERIFY' | 'EDIT' | 'CREATE' | 'LOGIN' | 'SIGNUP' | 'LOGOUT' | 'LOGIN_FAILED';
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

export type ShootStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

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
