import { Condition, Equipment, EquipmentIssueSeverity, EquipmentIssueType } from '@/types';

export interface ActiveEquipmentIssue {
    condition: Condition;
    issueType: EquipmentIssueType;
    severity: EquipmentIssueSeverity;
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
}

export const ISSUE_CONDITIONS: Condition[] = [
    'SCRATCHES',
    'NOT_FUNCTIONING',
    'NEEDS_BATTERY',
    'LOOSE_MOUNT',
    'DAMAGED',
];

export const CONDITION_LABELS: Record<Condition, string> = {
    OK: 'OK',
    SCRATCHES: 'Scratches',
    NOT_FUNCTIONING: 'Not Functioning',
    NEEDS_BATTERY: 'Needs Battery',
    LOOSE_MOUNT: 'Loose Mount',
    DAMAGED: 'Damaged',
};

export const EQUIPMENT_ISSUE_TYPE_LABELS: Record<EquipmentIssueType, string> = {
    PHYSICAL_DAMAGE: 'Physical damage',
    NOT_WORKING: 'Not working',
    MISSING_ITEM_PART: 'Missing item/part',
    POWER_ISSUE: 'Power issue',
    CONNECTION_ISSUE: 'Connection issue',
    OTHER: 'Other',
};

export const EQUIPMENT_ISSUE_SEVERITY_LABELS: Record<EquipmentIssueSeverity, string> = {
    MINOR: 'Minor',
    USABLE_WITH_WARNING: 'Usable with warning',
    NOT_USABLE: 'Not usable',
};

export const EQUIPMENT_ISSUE_TYPE_OPTIONS: Array<{ value: EquipmentIssueType; label: string }> = [
    { value: 'PHYSICAL_DAMAGE', label: EQUIPMENT_ISSUE_TYPE_LABELS.PHYSICAL_DAMAGE },
    { value: 'NOT_WORKING', label: EQUIPMENT_ISSUE_TYPE_LABELS.NOT_WORKING },
    { value: 'MISSING_ITEM_PART', label: EQUIPMENT_ISSUE_TYPE_LABELS.MISSING_ITEM_PART },
    { value: 'POWER_ISSUE', label: EQUIPMENT_ISSUE_TYPE_LABELS.POWER_ISSUE },
    { value: 'CONNECTION_ISSUE', label: EQUIPMENT_ISSUE_TYPE_LABELS.CONNECTION_ISSUE },
    { value: 'OTHER', label: EQUIPMENT_ISSUE_TYPE_LABELS.OTHER },
];

export const EQUIPMENT_ISSUE_SEVERITY_OPTIONS: Array<{ value: EquipmentIssueSeverity; label: string; description: string }> = [
    { value: 'MINOR', label: EQUIPMENT_ISSUE_SEVERITY_LABELS.MINOR, description: 'Small issue, safe to use.' },
    { value: 'USABLE_WITH_WARNING', label: EQUIPMENT_ISSUE_SEVERITY_LABELS.USABLE_WITH_WARNING, description: 'Can be used, but users must know first.' },
    { value: 'NOT_USABLE', label: EQUIPMENT_ISSUE_SEVERITY_LABELS.NOT_USABLE, description: 'Block checkout until fixed or moved to maintenance.' },
];

export function isIssueCondition(condition?: Condition) {
    return !!condition && condition !== 'OK';
}

export function conditionToIssueType(condition?: Condition): EquipmentIssueType {
    switch (condition) {
        case 'SCRATCHES':
        case 'DAMAGED':
            return 'PHYSICAL_DAMAGE';
        case 'NOT_FUNCTIONING':
            return 'NOT_WORKING';
        case 'NEEDS_BATTERY':
            return 'POWER_ISSUE';
        case 'LOOSE_MOUNT':
            return 'CONNECTION_ISSUE';
        default:
            return 'OTHER';
    }
}

export function conditionToIssueSeverity(condition?: Condition): EquipmentIssueSeverity {
    switch (condition) {
        case 'NOT_FUNCTIONING':
            return 'NOT_USABLE';
        case 'NEEDS_BATTERY':
        case 'LOOSE_MOUNT':
        case 'DAMAGED':
            return 'USABLE_WITH_WARNING';
        case 'SCRATCHES':
            return 'MINOR';
        default:
            return 'MINOR';
    }
}

export function issueToCondition(issueType: EquipmentIssueType, severity: EquipmentIssueSeverity): Condition {
    if (severity === 'NOT_USABLE') return issueType === 'POWER_ISSUE' ? 'NEEDS_BATTERY' : 'NOT_FUNCTIONING';

    switch (issueType) {
        case 'PHYSICAL_DAMAGE':
            return severity === 'MINOR' ? 'SCRATCHES' : 'DAMAGED';
        case 'POWER_ISSUE':
            return 'NEEDS_BATTERY';
        case 'CONNECTION_ISSUE':
        case 'MISSING_ITEM_PART':
            return 'LOOSE_MOUNT';
        case 'NOT_WORKING':
            return 'NOT_FUNCTIONING';
        case 'OTHER':
        default:
            return severity === 'MINOR' ? 'SCRATCHES' : 'DAMAGED';
    }
}

export function getEquipmentIssue(item?: Equipment | null): ActiveEquipmentIssue | null {
    const issue = item?.metadata?.activeIssue;
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return null;

    const candidate = issue as Partial<ActiveEquipmentIssue>;
    if (!candidate.note || typeof candidate.note !== 'string') return null;

    const condition = candidate.condition || item?.condition || 'DAMAGED';
    const issueType = candidate.issueType || conditionToIssueType(condition);
    const severity = candidate.severity || conditionToIssueSeverity(condition);

    return {
        condition,
        issueType,
        severity,
        note: candidate.note,
        source: candidate.source || 'manual',
        reportedAt: candidate.reportedAt,
        reportedBy: candidate.reportedBy,
        reporterName: candidate.reporterName,
        verifiedAt: candidate.verifiedAt,
        verifiedBy: candidate.verifiedBy,
        resolvedAt: candidate.resolvedAt,
        resolvedBy: candidate.resolvedBy,
        resolutionNote: candidate.resolutionNote,
    };
}

export function hasEquipmentIssue(item?: Equipment | null) {
    return getEquipmentIssue(item) !== null;
}

export function isEquipmentIssueBlocking(item?: Equipment | null) {
    return getEquipmentIssue(item)?.severity === 'NOT_USABLE';
}

export function getIssueSummary(issue: ActiveEquipmentIssue) {
    return `${EQUIPMENT_ISSUE_TYPE_LABELS[issue.issueType]} - ${EQUIPMENT_ISSUE_SEVERITY_LABELS[issue.severity]}`;
}

export function withActiveIssue(metadata: Equipment['metadata'], issue: ActiveEquipmentIssue | null) {
    const next = { ...(metadata || {}) };
    if (issue) {
        next.activeIssue = issue;
    } else {
        delete next.activeIssue;
    }
    return next;
}
