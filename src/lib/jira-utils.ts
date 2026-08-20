import { ShootStatus } from '@/types';

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
