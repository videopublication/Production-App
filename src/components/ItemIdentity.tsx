import React from 'react';
import { Equipment } from '@/types';

/**
 * Shared equipment-identity renderer. Every list/card/row that shows an item
 * (inventory grid, item detail hero, checkout suggestions + cart, verification
 * tiles, …) used to hand-roll "name + size chip + brand·model + barcode", which
 * meant a fix in one place never reached the others. Render this instead.
 *
 * - `name`   : item name + inline size chip (from metadata.size)
 * - `detail` : "Brand · Model" line (omitted when both empty)
 * - `meta`   : "Category • Barcode" line, with Category hidden when it just
 *              duplicates the name (e.g. a "Battery" named "Battery")
 *
 * `variant` scales the type for the surface it sits on. Pass `hideMeta` when the
 * caller already renders the barcode/category elsewhere.
 */

type ItemLike = Pick<Equipment, 'name' | 'category' | 'barcode' | 'metadata'>;

type Variant = 'sm' | 'md' | 'lg';

const NAME_CLASS: Record<Variant, string> = {
    sm: 'font-medium text-sm truncate text-foreground',
    md: 'font-semibold text-[14px] leading-tight truncate text-foreground',
    lg: 'text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate',
};

const DETAIL_CLASS: Record<Variant, string> = {
    sm: 'text-[11px] font-medium text-foreground/70 truncate',
    md: 'text-[11px] font-medium text-foreground/70 truncate leading-tight mt-0.5',
    lg: 'text-sm font-medium text-foreground/75 mt-1',
};

const META_CLASS: Record<Variant, string> = {
    sm: 'text-xs text-muted-foreground truncate',
    md: 'text-[11px] text-muted-foreground truncate leading-none mt-0.5',
    lg: 'text-sm text-muted-foreground mt-0.5',
};

const CHIP_CLASS: Record<Variant, string> = {
    sm: 'text-[9px] px-1.5 py-0.5',
    md: 'text-[10px] px-1.5 py-0.5',
    lg: 'text-xs px-2 py-0.5',
};

export function itemDetailLine(item: ItemLike): string {
    return [item.metadata?.brand, item.metadata?.model].filter(Boolean).join(' · ');
}

export function itemMetaLine(item: ItemLike): string {
    const dup = item.category.trim().toLowerCase() === item.name.trim().toLowerCase();
    return dup ? item.barcode : `${item.category} • ${item.barcode}`;
}

export function ItemIdentity({
    item,
    variant = 'md',
    hideMeta = false,
    wrapName = false,
    className = '',
}: {
    item: ItemLike;
    variant?: Variant;
    hideMeta?: boolean;
    /** Let a long name wrap to 2 lines instead of truncating (for tight rows
     *  where the barcode alone isn't enough to identify the item). */
    wrapName?: boolean;
    className?: string;
}) {
    const detail = itemDetailLine(item);
    const nameCls = wrapName
        ? NAME_CLASS[variant].replace('truncate', 'line-clamp-2 break-words min-w-0')
        : NAME_CLASS[variant];
    return (
        <div className={`min-w-0 ${className}`}>
            <div className={`flex gap-1.5 min-w-0 ${wrapName ? 'items-start' : 'items-center'}`}>
                <span className={nameCls}>{item.name}</span>
                {item.metadata?.size && (
                    <span className={`shrink-0 font-semibold rounded bg-secondary text-foreground/70 border border-border/60 whitespace-nowrap ${CHIP_CLASS[variant]}`}>
                        {item.metadata.size}
                    </span>
                )}
            </div>
            {detail && <p className={DETAIL_CLASS[variant]}>{detail}</p>}
            {!hideMeta && <p className={META_CLASS[variant]}>{itemMetaLine(item)}</p>}
        </div>
    );
}
