import type { Equipment } from '@/types';
import { isConnectorCategory } from './connectors';

/**
 * Composing an item's display name from its parts.
 *
 * Most items were entered with the name set to just the category — an item called "Battery"
 * in category "Battery" — which tells nobody which battery it is. A name reads better as
 * brand → model → size → category: "Sony NP F970 Small Battery".
 *
 * The name is derived data, so it can drift when someone later edits the brand or model.
 * Two things keep it honest: the Add form composes it as you type, and the bulk rename tool
 * can be re-run at any time.
 *
 * Connectors are excluded throughout — they already have their own builder producing
 * "XLR (F) → 2XLR (M)", and the generic rule would destroy those names.
 */

const clean = (value?: string | null) => (value || '').trim().replace(/\s+/g, ' ');

/** Word-level containment, so "Sony" isn't added twice when the model is "Sony FX3". */
const alreadyContains = (haystack: string, needle: string) => {
    const h = haystack.toLowerCase();
    const n = needle.toLowerCase();
    if (!n) return true;
    return h === n || h.includes(n);
};

export interface NameParts {
    brand?: string;
    model?: string;
    size?: string;
    category?: string;
}

/**
 * "Sony NP F970 Small Battery".
 *
 * Missing parts are simply skipped, so an unbranded item falls back to its category. A part
 * already present in what's been built is not repeated — a model of "Sony FX3" under brand
 * "Sony" yields "Sony FX3 Camera", not "Sony Sony FX3 Camera".
 */
export function buildEquipmentName({ brand, model, size, category }: NameParts): string {
    const ordered = [clean(brand), clean(model), clean(size), clean(category)];
    let name = '';
    for (const part of ordered) {
        if (!part) continue;
        if (name && alreadyContains(name, part)) continue;
        name = name ? `${name} ${part}` : part;
    }
    return name;
}

/** The name this item would be given. Empty when there's nothing to build from. */
export function proposedEquipmentName(item: Pick<Equipment, 'category' | 'metadata'>): string {
    return buildEquipmentName({
        brand: item.metadata?.brand,
        model: item.metadata?.model,
        size: item.metadata?.size,
        category: item.category,
    });
}

/**
 * Whether renaming this item is a safe, obvious improvement rather than overwriting a name
 * somebody chose deliberately.
 *
 * Safe when the current name is empty, is just the category, or is already wholly contained
 * in the proposed name (so the rename only adds detail). Anything else — "A-cam (Ramesh)" —
 * is left for a human to opt into.
 */
export function isSafeToRename(item: Pick<Equipment, 'name' | 'category' | 'metadata'>): boolean {
    const current = clean(item.name);
    const proposed = proposedEquipmentName(item);
    if (!proposed || proposed === current) return false;
    if (!current) return true;
    if (current.toLowerCase() === clean(item.category).toLowerCase()) return true;
    return alreadyContains(proposed, current);
}

/** Items this tool refuses to touch, whatever the caller asks. */
export function isRenameExcluded(item: Pick<Equipment, 'category'>): boolean {
    return isConnectorCategory(item.category);
}

/**
 * True when the proposal would throw information away.
 *
 * An item hand-named "Sony A7S III Camera Body" whose brand and model fields are empty would
 * compose down to just "Camera". Such a rename is never an improvement, so it isn't offered
 * at all rather than being offered and left unticked — an unticked row is still one mis-click
 * from losing the better name.
 */
export function renameLosesDetail(item: Pick<Equipment, 'name' | 'category' | 'metadata'>): boolean {
    const current = clean(item.name);
    const proposed = proposedEquipmentName(item);
    if (!current || !proposed) return false;
    return alreadyContains(current, proposed);
}

/**
 * Parts of a row that the name already says, so the UI can stop repeating itself.
 * Used by ItemIdentity to drop a redundant "Sony · NP F970" line under
 * "Sony NP F970 Small Battery".
 */
export function nameCovers(
    item: Pick<Equipment, 'name' | 'metadata'>,
    value?: string | null,
): boolean {
    const part = clean(value);
    if (!part) return false;
    return alreadyContains(clean(item.name), part);
}
