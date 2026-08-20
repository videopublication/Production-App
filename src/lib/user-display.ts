import { Role, User } from '@/types';

/**
 * Shared presentation helpers for the user list and the individual user page, so
 * a person is drawn the same way on both: same monogram, same status wording,
 * same phone formatting.
 *
 * Colour deliberately stays inside the app's existing vocabulary — status goes
 * through `Badge` variants, everything else through tokens. Nothing here invents
 * a palette.
 */

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

/** Sort weight for roles: most privileged first. */
export const ROLE_ORDER: Role[] = [
    'SUPER_ADMIN',
    'ADMIN',
    'MANAGER',
    'FINANCE_MANAGER',
    'DATA_MANAGER',
    'CREW',
];

export const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    FINANCE_MANAGER: 'Finance Manager',
    DATA_MANAGER: 'Data Manager',
    CREW: 'Crew',
};

/** Roles an admin can hand out from the user pages. Super Admin is not grantable here. */
export const ASSIGNABLE_ROLES: Role[] = [
    'CREW',
    'MANAGER',
    'FINANCE_MANAGER',
    'DATA_MANAGER',
    'ADMIN',
];

export const roleLabel = (role?: string | null) => {
    if (!role) return '—';
    return ROLE_LABELS[role] || role
        .toLowerCase()
        .split('_')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

/** WhatsApp brand green, darkened for light backgrounds where it carries text. */
export const TEXT_WHATSAPP = 'text-[#1da851] dark:text-[#25d366]';

/**
 * Role colour, carried by the badge and the avatar. These are the values from the
 * deployed Team Members page — colour encodes role, not identity, so a directory
 * scan tells you who the admins are instead of showing 30 unrelated hues.
 */
export const ROLE_BADGE: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    ADMIN: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    FINANCE_MANAGER: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
    DATA_MANAGER: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
    MANAGER: 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary',
    CREW: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
};

export const roleBadgeClass = (role?: string | null) => ROLE_BADGE[role || ''] || ROLE_BADGE.CREW;

export const ROLE_AVATAR: Record<string, string> = {
    SUPER_ADMIN: 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-500/30',
    ADMIN: 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-500/30',
    FINANCE_MANAGER: 'bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-indigo-500/30',
    DATA_MANAGER: 'bg-gradient-to-br from-cyan-500 to-cyan-600 shadow-cyan-500/30',
    MANAGER: 'bg-gradient-to-br from-primary to-primary shadow-primary/30',
    CREW: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30',
};

export const roleAvatarClass = (role?: string | null) => ROLE_AVATAR[role || ''] || ROLE_AVATAR.CREW;

/**
 * Status tones built from the app's own semantic variables — `--success`,
 * `--orange`, `--destructive` — rather than a separate Tailwind ramp. The text
 * step is darkened for light backgrounds, where the raw system colour is too
 * light to read (see TEXT_WHATSAPP for the same treatment).
 */
export const STATUS_BADGE: Record<string, string> = {
    ACTIVE: 'bg-success/12 text-[#248a3d] dark:text-[#34c759]',
    PENDING: 'bg-[var(--orange)]/15 text-[#b36800] dark:text-[#ff9500]',
    SUSPENDED: 'bg-destructive/12 text-destructive',
};

/** Filled tab in the status switcher, per state. */
export const STATUS_TAB_ACTIVE: Record<string, string> = {
    ALL: 'bg-card text-foreground shadow-sm',
    ACTIVE: 'bg-success text-success-foreground shadow-sm',
    PENDING: 'bg-[var(--orange)] text-[var(--orange-foreground)] shadow-sm',
    SUSPENDED: 'bg-destructive text-destructive-foreground shadow-sm',
};

/**
 * Row-level action styling. Kept here so the two user pages share one source
 * of truth and no colour literal lives in a page file.
 */
export const PILL_ON = 'bg-success/12 text-[#248a3d] hover:bg-success/20 dark:text-[#34c759]';
export const PILL_OFF = 'bg-secondary text-muted-foreground hover:bg-muted';
export const PILL_SUSPEND = 'bg-destructive/10 text-destructive hover:bg-destructive/20';
export const PILL_ACTIVATE = 'bg-success/12 text-[#248a3d] hover:bg-success/20 dark:text-[#34c759]';
export const PILL_APPROVER_ON = 'bg-warning/25 text-[#8a6d00] hover:bg-warning/40 dark:text-[var(--warning)]';
export const PILL_APPROVER_OFF = 'bg-secondary text-muted-foreground hover:bg-muted hover:text-[#8a6d00]';
export const ICON_BUTTON = 'bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground';

export const statusBadgeClass = (status?: string | null) => STATUS_BADGE[status || ''] || STATUS_BADGE.PENDING;

/** Filled dot for a settled state, hollow for one that is still waiting. */
export const statusGlyph = (status?: string | null) => (status === 'PENDING' ? '○' : '●');

export const STATUS_META: Record<UserStatus, {
    label: string;
    /** One line explaining what the state means for the person. */
    help: string;
}> = {
    ACTIVE: { label: 'Active', help: 'Can sign in and use the app.' },
    PENDING: { label: 'Pending', help: 'Signed up but not approved yet — sent to the holding screen on login.' },
    SUSPENDED: { label: 'Suspended', help: 'Blocked from signing in. History and assignments are kept.' },
};

export const statusMeta = (status?: string | null) =>
    STATUS_META[(status as UserStatus) || 'PENDING'] || STATUS_META.PENDING;

/**
 * Status colour comes from `Badge`, so it matches every other status in the app
 * and stays independent of `--primary` (which the accent picker changes).
 */
export const statusBadgeVariant = (status?: string | null): 'success' | 'orange' | 'destructive' | 'secondary' => {
    switch (status) {
        case 'ACTIVE': return 'success';
        case 'PENDING': return 'orange';
        case 'SUSPENDED': return 'destructive';
        default: return 'secondary';
    }
};

/** Up to two initials: first name + last name, falling back to the first two letters. */
export const initials = (name?: string | null) => {
    const clean = (name || '').trim();
    if (!clean) return '?';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Digits only — the form WhatsApp JIDs and tags use. */
export const phoneDigits = (phone?: string | null) => (phone || '').replace(/[^\d]/g, '');

/**
 * Tidy a typed number: keep a leading +, drop everything else that is not a
 * digit, and assume India for bare 10-digit entries (the common local case).
 */
export const normalizePhoneInput = (raw?: string | null) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/[^\d]/g, '');
    if (!digits) return '';
    if (!hasPlus && digits.length === 10) return `+91${digits}`;
    if (!hasPlus && digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    return hasPlus ? `+${digits}` : digits;
};

/** +91 98765 43210 — grouped for reading, never for storage. */
export const formatPhone = (phone?: string | null) => {
    const digits = phoneDigits(phone);
    if (!digits) return '';
    if (digits.length === 12 && digits.startsWith('91')) {
        return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
    return (phone || '').trim();
};

export const whatsappTag = (phone?: string | null) => {
    const digits = phoneDigits(phone);
    return digits ? `@${digits}` : '';
};

export const whatsappHref = (phone?: string | null) => {
    const digits = phoneDigits(phone);
    return digits ? `https://wa.me/${digits}` : '';
};

export const userPhone = (u?: Partial<User> | null) => u?.phone || u?.whatsappNumber || '';

/** Crew are shoot-assignable unless told otherwise; everyone else opts in. */
export const isShootAssignable = (u: Partial<User>) =>
    u.canBeAssignedToShoots ?? u.role === 'CREW';
