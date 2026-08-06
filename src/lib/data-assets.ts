import type { Equipment, Role } from '@/types';

/**
 * Data-team assets.
 *
 * A department can have a separate data team that custodies its own pool of items —
 * memory cards, hard disks, laptops, phones, bags, ethernet connectors, card readers —
 * and lends them out either for a shoot or as an ad-hoc borrow. Those items live in the
 * normal inventory (so they get checkout, returns, damage reporting, history and logs for
 * free) and are distinguished only by a custodian tag.
 *
 * Tagging rather than hard-coding categories means the next item type the team buys needs
 * no code change.
 */

export type Custodian = 'DATA';

/** True when the item belongs to the data team rather than the camera-gear pool.
 *  Stored in the open `metadata` blob, so no schema change was needed. */
export const isDataAsset = (item?: Pick<Equipment, 'metadata'> | null): boolean =>
    item?.metadata?.custodian === 'DATA';

/** Cards get two extras the other data assets don't: a human card number, and a row in
 *  the data team's shoot report. */
export const isCardCategory = (category?: string): boolean => {
    const c = (category || '').trim().toLowerCase();
    return c === 'card'
        || c === 'cards'
        || c === 'memory card'
        || c === 'sd card'
        || c === 'cf card'
        || c === 'cfexpress';
};

export const isCard = (item?: Pick<Equipment, 'category'> | null): boolean =>
    isCardCategory(item?.category);

/** The card number shown to people ("22"), as opposed to the scannable barcode
 *  ("CARD-22"). Falls back to the barcode's trailing number when unset. */
export const getCardNumber = (item?: Pick<Equipment, 'metadata' | 'barcode'> | null): string => {
    const explicit = (item?.metadata?.cardNumber as string | undefined)?.trim();
    if (explicit) return explicit;
    const trailing = (item?.barcode || '').match(/(\d+)\s*$/);
    return trailing ? trailing[1] : '';
};

/** Natural sort for card numbers so 2 comes before 10. */
export const compareCardNumbers = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const ALWAYS_MANAGE: Role[] = ['ADMIN', 'SUPER_ADMIN'];

/**
 * Who may add/edit/delete a given item.
 *
 * Data assets are the data team's to manage; camera gear stays with the equipment
 * managers exactly as before. Admins can manage everything.
 */
export const canManageItem = (
    user?: { role?: Role | null } | null,
    item?: Pick<Equipment, 'metadata'> | null,
): boolean => {
    const role = user?.role;
    if (!role) return false;
    if (ALWAYS_MANAGE.includes(role)) return true;
    return isDataAsset(item) ? role === 'DATA_MANAGER' : role === 'MANAGER';
};

/** Whether this user manages data assets at all — gates the data views and the report. */
export const canManageDataAssets = (user?: { role?: Role | null } | null): boolean => {
    const role = user?.role;
    return !!role && (role === 'DATA_MANAGER' || ALWAYS_MANAGE.includes(role));
};
