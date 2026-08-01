import {
    Condition,
    Department,
    Equipment,
    EquipmentIssueSeverity,
    EquipmentIssueType,
    ManualTransactionItem,
    ReturnVerificationMode,
} from '@/types';
import {
    getEquipmentIssue,
    getIssueSummary,
    hasEquipmentIssue,
    isIssueCondition,
    issueToCondition,
    withActiveIssue,
} from './equipment-issues';

/**
 * Return disposition rules — shared by the crew returns flow and checkout.
 *
 * The bottleneck this solves: every return used to land in PENDING_VERIFICATION, and
 * checkout only accepts AVAILABLE items. With no manager around to verify, returned gear
 * was frozen and the next person couldn't check it out.
 *
 * Each department picks how much sign-off it wants (`ReturnVerificationMode`), and the
 * one rule that holds in every mode: an item returned WITH a reported issue always waits
 * for a manager. Damaged gear never quietly re-enters circulation.
 */

/** Reads the per-department verification mode. Absent, or Super Admin in the global view
 *  with no department pinned, ⇒ 'none'. */
export const getReturnVerificationMode = (department?: Department | null): ReturnVerificationMode =>
    department?.settings?.returnVerification ?? 'none';

/** Whether the next person checking an item out is allowed to clear it themselves.
 *  False in 'manager' mode — otherwise crew could bypass the manager requirement. */
export const canVerifyAtCheckout = (department?: Department | null): boolean =>
    getReturnVerificationMode(department) !== 'manager';

export interface ReturnReport {
    condition: Condition;
    issueType: EquipmentIssueType;
    issueSeverity: EquipmentIssueSeverity;
    issueNote?: string;
}

interface Actor {
    id?: string;
    name?: string;
}

/**
 * The updates that put a piece of equipment back into circulation.
 *
 * Shared by the two paths that can release an item without a manager: a clean crew
 * return, and the next person verifying it at checkout.
 *
 * `assignedTo` must be cleared — an AVAILABLE item still holding an assignee is the
 * "stale assignment" state the inventory data-consistency check reports as an error.
 * An unresolved `activeIssue` is deliberately left in place (and its condition kept):
 * only a manager resolves a reported issue, so gear that came back with a warning keeps
 * carrying it.
 */
export function releasedEquipmentUpdates(item?: Equipment, now = new Date().toISOString()): Partial<Equipment> {
    return {
        status: 'AVAILABLE',
        condition: hasEquipmentIssue(item) ? (item?.condition ?? 'OK') : 'OK',
        assignedTo: null as unknown as string,
        lastActivity: now,
    };
}

export interface EquipmentReturnDisposition {
    /** True when the item went straight back to AVAILABLE without a manager. */
    selfReleased: boolean;
    updates: Partial<Equipment>;
    /** What to record in the transaction's postReturnConditions, or null when the item is
     *  waiting on a manager (they record it at verification time). Writing this is what
     *  lets the transaction close — it is the only key every closing path checks. */
    conditionToRecord: Condition | null;
}

/**
 * Decide what a returned piece of equipment becomes.
 *
 * Note on a self-release: it deliberately does NOT clear an existing `activeIssue` and
 * does not overwrite an issue condition. If gear went out with a known warning it comes
 * back still carrying it (so it still shows as "Issue" / "Needs attention", and a
 * NOT_USABLE issue still blocks checkout). Only a manager verify resolves an issue.
 */
export function resolveEquipmentReturn({
    item,
    report,
    mode,
    actor,
    now = new Date().toISOString(),
}: {
    item?: Equipment;
    report: ReturnReport;
    mode: ReturnVerificationMode;
    actor: Actor;
    now?: string;
}): EquipmentReturnDisposition {
    const { condition, issueType, issueSeverity, issueNote } = report;
    const reportedIssue = isIssueCondition(condition);
    const issueCondition: Condition = reportedIssue ? issueToCondition(issueType, issueSeverity) : 'OK';

    // Held back when an issue was reported (always — damaged gear never auto-releases),
    // or when the department wants a second pair of eyes on every return. In 'checkout'
    // mode the item waits, but the next person picking it up can clear it themselves.
    if (reportedIssue || mode !== 'none') {
        return {
            selfReleased: false,
            conditionToRecord: null,
            updates: {
                status: 'PENDING_VERIFICATION',
                condition: issueCondition,
                ...(item && reportedIssue && issueNote
                    ? {
                        metadata: withActiveIssue(item.metadata, {
                            condition: issueCondition,
                            issueType,
                            severity: issueSeverity,
                            note: issueNote,
                            source: 'return',
                            reportedAt: now,
                            reportedBy: actor.id,
                            reporterName: actor.name,
                        }),
                    }
                    : {}),
            },
        };
    }

    // Clean return → straight back into circulation.
    return {
        selfReleased: true,
        conditionToRecord: 'OK',
        updates: releasedEquipmentUpdates(item, now),
    };
}

/** Human-readable summary of what the previous holder reported when they returned an
 *  item, for the "verify before checkout" prompt. Null when nothing was flagged. */
export function describeReportedIssue(item?: Equipment): string | null {
    const issue = getEquipmentIssue(item);
    if (!issue) return null;
    return getIssueSummary(issue);
}

/**
 * Decide what a returned manual item becomes.
 *
 * A clean one goes to RETURNED, not PENDING_VERIFICATION — `areManualItemsComplete`
 * treats PENDING_VERIFICATION as incomplete, so leaving it there would hold the whole
 * transaction open waiting on a manager.
 *
 * Manual items (cables, consumables — things with no barcode) never pass through
 * checkout, so 'checkout' mode has no one to verify them and would strand them in the
 * queue forever. They therefore follow 'none' unless a manager is explicitly required.
 */
export function resolveManualItemReturn({
    manualItem,
    report,
    mode,
    actor,
    now = new Date().toISOString(),
}: {
    manualItem: ManualTransactionItem;
    report: ReturnReport;
    mode: ReturnVerificationMode;
    actor: Actor;
    now?: string;
}): ManualTransactionItem {
    const { condition, issueType, issueSeverity, issueNote } = report;
    const reportedIssue = isIssueCondition(condition);
    const selfReleased = !reportedIssue && mode !== 'manager';

    return {
        ...manualItem,
        status: selfReleased ? 'RETURNED' : 'PENDING_VERIFICATION',
        returnedQuantity: manualItem.quantity,
        returnCondition: reportedIssue ? issueToCondition(issueType, issueSeverity) : 'OK',
        issueType: reportedIssue ? issueType : undefined,
        issueSeverity: reportedIssue ? issueSeverity : undefined,
        returnNote: issueNote || undefined,
        returnedAt: now,
        returnedBy: actor.id,
        ...(selfReleased
            ? { selfVerified: true, verifiedAt: now, verifiedBy: actor.id }
            : {}),
    };
}
