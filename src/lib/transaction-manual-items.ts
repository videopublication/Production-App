import { ManualTransactionItem } from '@/types';

const START_MARKER = '[[VP_APP_MANUAL_ITEMS_V1]]';
const END_MARKER = '[[/VP_APP_MANUAL_ITEMS_V1]]';
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MANUAL_ITEMS_BLOCK = new RegExp(
    `\\s*${escapeRegExp(START_MARKER)}\\s*([\\s\\S]*?)\\s*${escapeRegExp(END_MARKER)}\\s*`,
    'm'
);

export function decodeTransactionNotes(rawNotes?: string | null): { notes?: string; manualItems: ManualTransactionItem[] } {
    if (!rawNotes) return { notes: undefined, manualItems: [] };

    const match = rawNotes.match(MANUAL_ITEMS_BLOCK);
    if (!match) {
        return { notes: rawNotes || undefined, manualItems: [] };
    }

    let manualItems: ManualTransactionItem[] = [];
    try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
            manualItems = parsed.filter(item =>
                item &&
                typeof item.id === 'string' &&
                typeof item.name === 'string' &&
                typeof item.quantity === 'number'
            ) as ManualTransactionItem[];
        }
    } catch {
        manualItems = [];
    }

    const notes = rawNotes.replace(MANUAL_ITEMS_BLOCK, '').trim();
    return { notes: notes || undefined, manualItems };
}

export function encodeTransactionNotes(notes?: string | null, manualItems?: ManualTransactionItem[]) {
    const cleanNotes = decodeTransactionNotes(notes).notes || '';
    const cleanManualItems = manualItems || [];

    if (cleanManualItems.length === 0) {
        return cleanNotes || undefined;
    }

    const block = `${START_MARKER}\n${JSON.stringify(cleanManualItems)}\n${END_MARKER}`;
    return cleanNotes ? `${cleanNotes}\n\n${block}` : block;
}

export function getManualItemsSummary(manualItems?: ManualTransactionItem[]) {
    const count = manualItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    return `${count} manual item${count === 1 ? '' : 's'}`;
}

export function areManualItemsComplete(manualItems?: ManualTransactionItem[]) {
    return (manualItems || []).every(item =>
        !item.returnRequired ||
        item.status === 'RETURNED' ||
        item.status === 'MISSING'
    );
}
