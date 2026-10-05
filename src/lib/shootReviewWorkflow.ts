import { Shoot } from '@/types';
import { parseISO, isBefore } from 'date-fns';

export type ShootWorkflowStage = 
    | 'REVIEW_DONE'            // Footage reviewed and approved
    | 'READY_FOR_REVIEW'       // Shoot is CLOSED, Admin marked reviewRequired: true, ready for review
    | 'AWAITING_CLOSE'         // Review required, but shoot not closed yet
    | 'NO_REVIEW_REQUIRED'     // Shoot does not require review (default)
    | 'CANCELLED';             // Shoot was cancelled

/**
 * Determine the exact review workflow stage for a shoot.
 * Production pipeline rules:
 * 1. Cancelled: Shoot was cancelled.
 * 2. No Review Required: Admin has not marked review as required. (Default for all shoots)
 * 3. Review Done: Reviewer has submitted feedback and signed off.
 * 4. Ready for Review: Shoot is CLOSED and Admin has assigned/required review.
 * 5. Awaiting Close: Review is required, but shoot has not yet been wrapped and closed.
 */
export function getShootReviewStage(shoot: Shoot): ShootWorkflowStage {
    if (shoot.status === 'CANCELLED') {
        return 'CANCELLED';
    }

    // Rule: Review ONLY applies if shoot is explicitly marked by Admin as reviewRequired: true!
    if (!shoot.reviewRequired) {
        return 'NO_REVIEW_REQUIRED';
    }

    // Review is required. Has it been completed?
    if (shoot.reviewStatus === 'DONE') {
        return 'REVIEW_DONE';
    }

    // Rule: Review can ONLY happen once the shoot is CLOSED!
    if (shoot.status === 'CLOSED') {
        return 'READY_FOR_REVIEW';
    }

    // Review is required, but shoot is still open / in progress
    return 'AWAITING_CLOSE';
}

/**
 * Helper display metadata for each workflow stage.
 */
export function getReviewStageDisplay(stage: ShootWorkflowStage) {
    switch (stage) {
        case 'REVIEW_DONE':
            return {
                label: 'Review Done',
                shortLabel: 'Done',
                variant: 'emerald',
                badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
                description: 'Footage has been reviewed and signed off.'
            };
        case 'READY_FOR_REVIEW':
            return {
                label: 'Ready for Review',
                shortLabel: 'Review Ready',
                variant: 'blue',
                badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800',
                description: 'Shoot is closed and assigned for quality review.'
            };
        case 'AWAITING_CLOSE':
            return {
                label: 'Awaiting Wrap / Close',
                shortLabel: 'Awaiting Close',
                variant: 'amber',
                badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                description: 'Review assigned; awaiting shoot closure.'
            };
        case 'NO_REVIEW_REQUIRED':
            return {
                label: 'No Review Required',
                shortLabel: 'No Review',
                variant: 'gray',
                badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700',
                description: 'This shoot does not require review.'
            };
        case 'CANCELLED':
            return {
                label: 'Cancelled',
                shortLabel: 'Cancelled',
                variant: 'gray',
                badgeClass: 'bg-muted text-muted-foreground border-border',
                description: 'Shoot was cancelled.'
            };
        default:
            return {
                label: 'Pending',
                shortLabel: 'Pending',
                variant: 'gray',
                badgeClass: 'bg-muted text-muted-foreground border-border',
                description: 'Pending review status.'
            };
    }
}

/**
 * Checks whether a footage location is a server or local network storage path
 * Examples: \\192.168.1.50\VP_Shoots\3253, smb://nas.local/footage, Z:\Shoots\3253, /Volumes/Footage
 */
export function isServerStoragePath(url?: string): boolean {
    if (!url) return false;
    const trimmed = url.trim();
    return (
        trimmed.startsWith('\\\\') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('smb://') ||
        trimmed.startsWith('file://') ||
        /^[A-Za-z]:[\\\/]/.test(trimmed) ||
        trimmed.startsWith('/Volumes/') ||
        trimmed.startsWith('/mnt/')
    );
}

/**
 * Checks if the URL points directly to a video file
 */
export function isDirectVideoUrl(url?: string): boolean {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.m4v');
}

/**
 * Friendly label for the footage location source
 */
export function getFootageSourceLabel(url?: string): { label: string; isServer: boolean; isDirectVideo: boolean } {
    if (!url) return { label: 'None', isServer: false, isDirectVideo: false };
    const trimmed = url.trim();

    if (isServerStoragePath(trimmed)) {
        return { label: 'Server / NAS', isServer: true, isDirectVideo: false };
    }
    if (isDirectVideoUrl(trimmed)) {
        return { label: 'Video File', isServer: false, isDirectVideo: true };
    }
    if (/youtube\.com|youtu\.be/i.test(trimmed)) {
        return { label: 'YouTube', isServer: false, isDirectVideo: false };
    }
    if (/vimeo\.com/i.test(trimmed)) {
        return { label: 'Vimeo', isServer: false, isDirectVideo: false };
    }
    if (/drive\.google\.com/i.test(trimmed)) {
        return { label: 'Google Drive', isServer: false, isDirectVideo: false };
    }
    if (/frame\.io/i.test(trimmed)) {
        return { label: 'Frame.io', isServer: false, isDirectVideo: false };
    }
    if (/dropbox\.com|box\.com|onedrive/i.test(trimmed)) {
        return { label: 'Cloud Storage', isServer: false, isDirectVideo: false };
    }
    if (/^https?:\/\/(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[01])|localhost|.*\.local)/i.test(trimmed)) {
        return { label: 'Local NAS Web', isServer: true, isDirectVideo: false };
    }
    return { label: 'Web Link', isServer: false, isDirectVideo: false };
}

