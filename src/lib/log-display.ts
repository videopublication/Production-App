import type { Log } from '@/types';

export type LogBadgeVariant = 'default' | 'success' | 'warning' | 'secondary' | 'outline' | 'destructive';

/**
 * Badge tone for a log action. Shared by the activity log page and the per-member
 * activity tab so the same event never wears two different colours.
 */
export const logActionVariant = (action: Log['action'] | string): LogBadgeVariant => {
    switch (action) {
        case 'CHECKOUT': return 'default';
        case 'RETURN': return 'success';
        case 'EDIT': return 'warning';
        case 'CREATE': return 'default';
        // Deletions are irreversible, so they read as such at a glance.
        case 'DELETE': return 'destructive';
        case 'VERIFY': return 'secondary';
        case 'LOGIN': return 'success';
        case 'SIGNUP': return 'default';
        case 'LOGOUT': return 'secondary';
        case 'LOGIN_FAILED': return 'outline';
        default: return 'outline';
    }
};
