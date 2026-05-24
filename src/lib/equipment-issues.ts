import { Condition, Equipment } from '@/types';

export interface ActiveEquipmentIssue {
    condition: Condition;
    note: string;
    source: 'return' | 'verification' | 'manual';
    reportedAt?: string;
    reportedBy?: string;
    verifiedAt?: string;
    verifiedBy?: string;
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

export function isIssueCondition(condition?: Condition) {
    return !!condition && condition !== 'OK';
}

export function getEquipmentIssue(item?: Equipment | null): ActiveEquipmentIssue | null {
    const issue = item?.metadata?.activeIssue;
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return null;

    const candidate = issue as Partial<ActiveEquipmentIssue>;
    if (!candidate.note || typeof candidate.note !== 'string') return null;

    return {
        condition: candidate.condition || item?.condition || 'DAMAGED',
        note: candidate.note,
        source: candidate.source || 'manual',
        reportedAt: candidate.reportedAt,
        reportedBy: candidate.reportedBy,
        verifiedAt: candidate.verifiedAt,
        verifiedBy: candidate.verifiedBy,
    };
}

export function hasEquipmentIssue(item?: Equipment | null) {
    return getEquipmentIssue(item) !== null;
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
