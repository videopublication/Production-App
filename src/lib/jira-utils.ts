import { ShootStatus, User } from '@/types';
import { JiraComment } from '@/lib/jira';

/**
 * Normalizes any Jira status string (from Jira Server / Data Center) to our app ShootStatus.
 */
export const jiraStatusToAppStatus = (statusName?: string): ShootStatus => {
    if (!statusName) return 'OPEN';
    const s = statusName.trim().toLowerCase();

    if (s.includes('cancel')) return 'CANCELLED';
    if (s.includes('in progress') || s.includes('shoot in progress')) return 'SHOOT_IN_PROGRESS';
    if (s.includes('ready for shoot') || s === 'ready' || s === 'confirmed') return 'READY_FOR_SHOOT';
    if (s.includes('close') || s.includes('shoot over') || s.includes('resolved') || s.includes('done') || s.includes('complete')) return 'CLOSED';
    if (s.includes('hold')) return 'ON_HOLD';
    if (s.includes('waiting for requester') || s.includes('waiting')) return 'WAITING_FOR_REQUESTER';
    if (s.includes('pending production') || s.includes('production setup') || s.includes('setup')) return 'PENDING_PRODUCTION_SETUP';
    if (s.includes('open') || s.includes('to do') || s.includes('new')) return 'OPEN';

    return 'OPEN';
};

/**
 * Maps app ShootStatus to standard Jira transition / status names.
 */
export const appStatusToJiraStatus = (status: ShootStatus): string => {
    switch (status) {
        case 'OPEN': return 'Open';
        case 'WAITING_FOR_REQUESTER': return 'Waiting for Requester';
        case 'PENDING_PRODUCTION_SETUP': return 'Pending Production Setup';
        case 'READY_FOR_SHOOT':
        case 'CONFIRMED': return 'Ready for Shoot';
        case 'SHOOT_IN_PROGRESS': return 'Shoot In Progress';
        case 'ON_HOLD': return 'On Hold';
        case 'CLOSED': return 'Shoot Over / Close';
        case 'CANCELLED': return 'Cancelled';
        case 'DRAFT': return 'Open';
        default: return 'Open';
    }
};

/**
 * Consistent styling palette for all shoot statuses across UI components.
 */
export const getShootStatusStyle = (status: string) => {
    switch (status) {
        case 'OPEN':
            return { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc', label: 'OPEN' }; // Light Blue
        case 'WAITING_FOR_REQUESTER':
            return { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1', label: 'WAITING FOR REQUESTER' }; // Slate
        case 'PENDING_PRODUCTION_SETUP':
            return { bg: '#ffedd5', text: '#c2410c', border: '#fdba74', label: 'PENDING SETUP' }; // Warm Orange
        case 'READY_FOR_SHOOT':
            return { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', label: 'READY FOR SHOOT' }; // Royal Blue
        case 'CONFIRMED':
            return { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', label: 'CONFIRMED' }; // Royal Blue
        case 'SHOOT_IN_PROGRESS':
            return { bg: '#dcfce7', text: '#15803d', border: '#86efac', label: 'SHOOT IN PROGRESS' }; // Emerald Green
        case 'ON_HOLD':
            return { bg: '#fef3c7', text: '#b45309', border: '#fcd34d', label: 'ON HOLD' }; // Amber
        case 'CLOSED':
            return { bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe', label: 'CLOSED' }; // Purple
        case 'CANCELLED':
            return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', label: 'CANCELLED' }; // Red
        case 'DRAFT':
            return { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db', label: 'DRAFT' }; // Gray
        default:
            return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db', label: status };
    }
};

/**
 * Builds the standard Cameramen notification text for Jira.
 */
export function buildCameramenCommentBody(assignedUsers: User[], deptTitle = 'Video Publications'): string {
    const formattedDept = deptTitle === 'Video Publication' ? 'Video Publications' : deptTitle;

    if (assignedUsers.length === 0) {
        return `Namaskaram\n\nPlease note: Cameramen assignments for this shoot are currently being updated.\n\nPranam\n${formattedDept}`;
    }

    const crewText = assignedUsers
        .map(u => u.phone ? `${u.name}-${u.phone}` : u.name)
        .join(', ');

    return `Namaskaram\n\nPlease find the cameramen for this shoot & their contact numbers below\n${crewText}\n\nPranam\n${formattedDept}`;
}

/**
 * Checks if a comment body matches the automated Cameramen notification.
 */
export function isCameramenComment(body?: string): boolean {
    if (!body) return false;
    const lower = body.toLowerCase();
    return lower.includes('cameramen for this shoot') ||
           (lower.includes('namaskaram') && lower.includes('cameramen')) ||
           lower.includes('cameramen assignments for this shoot');
}

/**
 * Syncs the cameramen comment to Jira:
 * - If an existing cameramen comment exists, it EDITS it (PUT) in place.
 * - If no comment exists and crew is assigned, it CREATES it (POST).
 * - Avoids posting duplicate comments again and again when crew members are added/removed.
 */
export async function syncJiraCameramenComment({
    ticketKey,
    assignedUsers,
    deptTitle = 'Video Publications',
    authorName = 'System',
    existingComments
}: {
    ticketKey: string;
    assignedUsers: User[];
    deptTitle?: string;
    authorName?: string;
    existingComments?: JiraComment[];
}): Promise<{ success: boolean; action: 'created' | 'updated' | 'none'; commentId?: string }> {
    if (!ticketKey) return { success: false, action: 'none' };

    try {
        const commentBody = buildCameramenCommentBody(assignedUsers, deptTitle);

        // 1. Get existing comments to find if one already exists
        let commentsList = existingComments;
        if (!commentsList) {
            const res = await fetch(`/api/jira/ticket/${encodeURIComponent(ticketKey)}/comments`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                commentsList = data.comments || [];
            }
        }

        const existingCameramenComment = (commentsList || []).find(c => isCameramenComment(c.body));

        if (existingCameramenComment) {
            // Strip any [Production App • ...] prefix for body comparison
            const currentCleanBody = existingCameramenComment.body.replace(/^\[Production App • [^\]]+\]\s*/i, '').trim();
            const targetCleanBody = commentBody.trim();

            // If already identical, skip redundant network call
            if (currentCleanBody === targetCleanBody) {
                return { success: true, action: 'none', commentId: existingCameramenComment.id };
            }

            // Edit the existing comment in Jira
            const putRes = await fetch(`/api/jira/ticket/${encodeURIComponent(ticketKey)}/comments/${encodeURIComponent(existingCameramenComment.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment: commentBody })
            });

            if (putRes.ok) {
                return { success: true, action: 'updated', commentId: existingCameramenComment.id };
            }
        } else if (assignedUsers.length > 0) {
            // Post new comment ONLY if none existed and at least 1 user is assigned
            const postRes = await fetch(`/api/jira/ticket/${encodeURIComponent(ticketKey)}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    body: commentBody,
                    isInternal: false,
                    authorName
                })
            });

            if (postRes.ok) {
                const data = await postRes.json();
                return { success: true, action: 'created', commentId: data.id };
            }
        }

        return { success: true, action: 'none' };
    } catch (err) {
        console.error('[syncJiraCameramenComment error]:', err);
        return { success: false, action: 'none' };
    }
}
