import { Equipment, ManualTransactionItem, Shoot, Transaction, User } from '@/types';
import { DepartmentLabels } from '@/lib/department-labels';
import { itemDetailLineForRow } from '@/components/ItemIdentity';
import { nameCovers } from '@/lib/equipment-naming';

/**
 * The shareable handover summary for a checkout (WhatsApp / clipboard).
 *
 * This is the message someone reads while physically checking gear in or out, so every
 * line has to identify a specific unit. Listing bare names and a count ("Lens - 2") told
 * the reader nothing about *which* two lenses left the building — so each item gets its
 * own numbered line with brand, model, barcode and serial.
 *
 * Manual items are included too: cables and consumables genuinely left with the crew, and
 * leaving them out of the handover list made the message look complete when it wasn't.
 */

/**
 * One line per unit: just the name.
 *
 * Names are now composed as "Sony NP F970 Small Battery", so brand, model and size are
 * already in there and repeating them would pad every line. Anything not yet renamed —
 * still called plainly "Battery" — keeps its brand and model appended, otherwise the message
 * would go back to being unreadable for those items. As the rename sweep progresses the extra
 * parts simply stop appearing.
 *
 * Barcodes and serials stay out: they're for scanning, not for reading on a phone.
 */
const describeItem = (item: Equipment | undefined, id: string): string => {
    if (!item) return `Unknown item (${id})`;

    const parts: string[] = [item.name];

    const size = item.metadata?.size?.trim();
    if (size && !nameCovers(item, size)) parts.push(size);

    const brandModel = itemDetailLineForRow(item); // brand · model, minus whatever the name says
    if (brandModel) parts.push(brandModel);

    return parts.join(' · ');
};

const describeManualItem = (item: ManualTransactionItem): string => {
    const qty = item.quantity > 1 ? ` × ${item.quantity}` : '';
    const kind = item.returnRequired ? 'returnable' : 'consumable';
    const note = item.notes?.trim() ? ` — ${item.notes.trim()}` : '';
    return `${item.name}${qty} (${kind})${note}`;
};

export function buildCheckoutMessage({
    transaction,
    equipment,
    users,
    shoots,
    labels,
}: {
    transaction: Transaction;
    equipment: Equipment[];
    users: User[];
    shoots: Shoot[];
    labels: DepartmentLabels;
}): string {
    const nameOf = (userId?: string) => {
        if (!userId) return null;
        const found = users.find(u => u.id === userId);
        return found?.name || found?.email || null;
    };

    const takenBy = [transaction.userId, ...(transaction.additionalUsers || [])]
        .map(nameOf)
        .filter((n): n is string => Boolean(n));

    // Sorted by name so like items sit together, but each line still names its own unit.
    const items = transaction.items
        .map(id => ({ id, item: equipment.find(e => e.id === id) }))
        .sort((a, b) => (a.item?.name || '').localeCompare(b.item?.name || '', undefined, {
            sensitivity: 'base',
            numeric: true,
        }));

    const manualItems = (transaction.manualItems || []).filter(i => i.name?.trim());

    const shoot = transaction.shootId ? shoots.find(s => s.id === transaction.shootId) : undefined;
    const shootLine = shoot
        ? `\n*Linked ${labels.workSingular}:* ${shoot.title}${shoot.shootNumber ? ` (#${shoot.shootNumber})` : ''}`
        : '';

    const date = new Date(transaction.timestampOut).toLocaleString(undefined, {
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

    const lines: string[] = [
        '🎥 *Equipment Checkout Details*',
        '',
        `*Project:* ${transaction.project || 'Unspecified'}${shootLine}`,
        `*ID:* ${transaction.id}`,
        `*Taken By:* ${takenBy.length ? takenBy.join(', ') : 'Unknown'}`,
        `*Date:* ${date}`,
    ];

    if (items.length > 0) {
        lines.push('', `*Equipment — ${items.length} item${items.length === 1 ? '' : 's'}*`);
        items.forEach(({ id, item }, index) => {
            lines.push(`${index + 1}. ${describeItem(item, id)}`);
        });
    }

    if (manualItems.length > 0) {
        const total = manualItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
        lines.push('', `*Manual items — ${total}*`);
        manualItems.forEach(item => lines.push(`• ${describeManualItem(item)}`));
    }

    if (items.length === 0 && manualItems.length === 0) {
        lines.push('', '_No items on this transaction._');
    }

    if (transaction.notes?.trim()) {
        lines.push('', '*Notes:*', transaction.notes.trim());
    }

    return lines.join('\n');
}
