import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface FacetOption { value: string; label: string }
export interface FacetGroup {
    key: string;
    label: string;                 // e.g. "Category"
    options: FacetOption[];
    selected: string[];
    onChange: (values: string[]) => void;
}

/**
 * One "Filters" control for a set of facet groups. Replaces a row of separate
 * dropdowns: a single button (with an active count) opens ONE panel holding every
 * facet as a checkbox list — a popover on desktop, a bottom sheet on phones. The
 * applied values render as removable chips next to the button, so the current
 * filter state is always visible and any one value can be dropped in a tap.
 *
 * Free-text search stays outside this component (in the page's search bar); this
 * is only the structured facets.
 */
export function FacetFilters({
    groups,
    resultCount,
    className = '',
}: {
    groups: FacetGroup[];
    resultCount: number;
    className?: string;
}) {
    const usable = groups.filter(g => g.options.length > 0);
    const totalSelected = usable.reduce((n, g) => n + g.selected.length, 0);

    const [open, setOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [groupQuery, setGroupQuery] = useState<Record<string, string>>({});
    const [openKey, setOpenKey] = useState<string | null>(null); // accordion: which facet is expanded
    const btnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    /**
     * Scrolls a freshly-opened option list to its first ticked value, so a selection buried at
     * position 40 of 66 is visible without hunting for it — while leaving the list in
     * alphabetical order.
     *
     * Attached as a ref callback and memoised with a stable identity on purpose: React then
     * only runs it when the list mounts (opening the panel, switching facet), not on every
     * render. Re-running it after each tick would yank the view back to the first selection
     * while the user is still working down the list.
     */
    const revealSelected = React.useCallback((node: HTMLDivElement | null) => {
        if (!node) return;
        const first = node.querySelector<HTMLElement>('[data-selected="true"]');
        if (!first) return;
        const listBox = node.getBoundingClientRect();
        const itemBox = first.getBoundingClientRect();
        if (itemBox.top < listBox.top || itemBox.bottom > listBox.bottom) {
            node.scrollTop += itemBox.top - listBox.top - 8;
        }
    }, []);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px), (pointer: coarse)');
        const sync = () => setIsMobile(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    // Desktop: click-outside + Esc close. Mobile: overlay + back button handle it.
    useEffect(() => {
        if (!open || isMobile) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open, isMobile]);

    // Mobile sheet: lock body scroll + close on hardware back.
    useEffect(() => {
        if (!open || !isMobile) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.history.pushState({ facetFilters: true }, '', window.location.href);
        const onPop = () => setOpen(false);
        window.addEventListener('popstate', onPop);
        return () => { document.body.style.overflow = prev; window.removeEventListener('popstate', onPop); };
    }, [open, isMobile]);

    const chips = useMemo(
        () => usable.flatMap(g => g.selected.map(v => ({
            group: g,
            value: v,
            label: g.options.find(o => o.value === v)?.label ?? v,
        }))),
        [usable],
    );

    const clearAll = () => usable.forEach(g => g.selected.length && g.onChange([]));
    const removeOne = (g: FacetGroup, v: string) => g.onChange(g.selected.filter(x => x !== v));
    const closeSheet = () => { if (isMobile) window.history.back(); else setOpen(false); };

    // Accordion: one facet expanded at a time. Default to the first group with a
    // selection, else the first group — so the panel stays short instead of dumping
    // every group's full list into one long scroll.
    const activeKey = openKey === null
        ? (usable.find(g => g.selected.length)?.key ?? usable[0]?.key ?? '')
        : openKey;

    // One facet's option panel: toolbar (count + Select all / Clear), optional search,
    // and the checkbox list. `fill` lets the list grow to fill a flex parent (the mobile
    // tabbed sheet) instead of a fixed-height popover slot.
    const GroupPanel = (group: FacetGroup, fill: boolean) => {
        const count = group.selected.length;
        const q = (groupQuery[group.key] || '').toLowerCase();
        const showSearch = group.options.length > 6;
        // Alphabetical, always. Selections keep their place in the list — the panel scrolls to
        // show them instead (see revealSelected), because moving a row out from under the
        // cursor is worse than having to look for it.
        const opts = q ? group.options.filter(o => o.label.toLowerCase().includes(q)) : group.options;
        const allShownSelected = opts.length > 0 && opts.every(o => group.selected.includes(o.value));
        return (
            <div className={fill ? 'flex min-h-0 flex-1 flex-col' : 'space-y-1'}>
                <div className="flex shrink-0 items-center justify-between px-0.5 pb-0.5">
                    <span className="text-[10px] text-gray-400">{group.options.length} option{group.options.length !== 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => { const set = new Set(group.selected); opts.forEach(o => set.add(o.value)); group.onChange(Array.from(set)); }}
                            disabled={allShownSelected}
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-40 cursor-pointer"
                        >
                            {q ? 'Select shown' : 'Select all'}
                        </button>
                        <button
                            type="button"
                            onClick={() => group.onChange([])}
                            disabled={count === 0}
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-40 cursor-pointer"
                        >
                            Clear
                        </button>
                    </div>
                </div>

                {showSearch && (
                    <input
                        type="text"
                        value={groupQuery[group.key] || ''}
                        onChange={e => setGroupQuery(s => ({ ...s, [group.key]: e.target.value }))}
                        placeholder={`Search ${group.label.toLowerCase()}…`}
                        className="h-7 w-full shrink-0 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    />
                )}

                <div
                    ref={revealSelected}
                    className={`grid grid-cols-1 gap-0.5 overflow-y-auto custom-scrollbar ${fill ? 'min-h-0 flex-1' : ''}`}
                    style={fill ? undefined : { maxHeight: '11rem' }}
                >
                    {opts.length === 0 ? (
                        <p className="px-1 py-1.5 text-xs text-gray-400">No matches.</p>
                    ) : opts.map(o => {
                        const checked = group.selected.includes(o.value);
                        return (
                            <label
                                key={o.value}
                                data-selected={checked ? 'true' : undefined}
                                className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors select-none ${checked ? 'bg-primary/10 text-primary font-semibold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                            >
                                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${checked ? 'border-primary bg-primary text-white' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
                                    {checked && (
                                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </span>
                                <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={checked}
                                    onChange={() => group.onChange(checked ? group.selected.filter(x => x !== o.value) : [...group.selected, o.value])}
                                />
                                <span className="min-w-0 truncate">{o.label}</span>
                            </label>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Desktop: accordion — one facet expanded at a time inside the popover.
    const Body = (
        <div className="space-y-1.5">
            {usable.map(group => {
                const isExpanded = group.key === activeKey;
                const count = group.selected.length;
                return (
                    <div key={group.key} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                        <button
                            type="button"
                            onClick={() => setOpenKey(isExpanded ? '' : group.key)}
                            className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors cursor-pointer ${isExpanded ? 'bg-gray-100 dark:bg-gray-800/80' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
                            aria-expanded={isExpanded}
                        >
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100">
                                {group.label}
                                {count > 0 && (
                                    <span className="rounded-full bg-primary px-1.5 py-0.2 text-[9px] font-bold text-white leading-tight">{count}</span>
                                )}
                            </span>
                            <svg className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {isExpanded && (
                            <div className="border-t border-gray-100 dark:border-gray-800 p-2 bg-white dark:bg-[#1c1c1e]">{GroupPanel(group, false)}</div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    // Mobile: a facet tab strip — tap Category / Brand / Size / Connector end to switch,
    // and only the active list scrolls. No hunting past a long list to reach another facet.
    const activeGroup = usable.find(g => g.key === activeKey) ?? usable[0];
    const MobileBody = (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex shrink-0 gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {usable.map(group => {
                    const isActive = group.key === activeGroup?.key;
                    const count = group.selected.length;
                    return (
                        <button
                            key={group.key}
                            type="button"
                            onClick={() => setOpenKey(group.key)}
                            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${isActive ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}
                            aria-pressed={isActive}
                        >
                            {group.label}
                            {count > 0 && (
                                <span className={`rounded-full px-1.5 text-[9px] font-bold leading-tight ${isActive ? 'bg-white/25 text-white' : 'bg-primary text-white'}`}>{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>
            {activeGroup && GroupPanel(activeGroup, true)}
        </div>
    );

    const Footer = (
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-800 px-0.5 pt-2">
            <button
                type="button"
                onClick={clearAll}
                disabled={totalSelected === 0}
                className="text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-40 cursor-pointer"
            >
                Clear all
            </button>
            <button
                type="button"
                onClick={closeSheet}
                className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
            >
                Show {resultCount} item{resultCount !== 1 ? 's' : ''}
            </button>
        </div>
    );

    if (usable.length === 0) return null;

    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
            <div className="relative">
                <button
                    ref={btnRef}
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${open || totalSelected > 0 ? 'border-primary/40 bg-primary/10 text-primary' : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    aria-expanded={open}
                >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 12h12M10 20h4" />
                    </svg>
                    Filters
                    {totalSelected > 0 && (
                        <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-bold text-white leading-tight">{totalSelected}</span>
                    )}
                    <svg className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* Desktop popover - aligned right so it never clips out of screen */}
                {open && !isMobile && (
                    <div
                        ref={popRef}
                        className="absolute right-0 z-[120] mt-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] p-2.5 shadow-xl space-y-2"
                        style={{ width: '19rem', maxWidth: 'calc(100vw - 2rem)' }}
                    >
                        <div className="overflow-y-auto pr-0.5 custom-scrollbar" style={{ maxHeight: '22rem' }}>{Body}</div>
                        <div>{Footer}</div>
                    </div>
                )}
            </div>

            {/* Active-filter chips */}
            {chips.map(chip => (
                <button
                    key={`${chip.group.key}:${chip.value}`}
                    type="button"
                    onClick={() => removeOne(chip.group, chip.value)}
                    className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 py-0.5 pl-2 pr-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                    title={`Remove ${chip.group.label}: ${chip.label}`}
                >
                    <span className="max-w-[8rem] truncate">{chip.label}</span>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            ))}
            {totalSelected > 0 && (
                <button type="button" onClick={clearAll} className="text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
                    Clear all
                </button>
            )}

            {/* Mobile bottom sheet */}
            {open && isMobile && typeof document !== 'undefined' && createPortal(
                <>
                    <div className="fixed inset-0 z-[155] bg-black/40 backdrop-blur-sm" onClick={closeSheet} />
                    <div className="fixed inset-x-0 bottom-0 z-[160] flex flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl" style={{ height: '85vh' }}>
                        {/* grab handle */}
                        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
                        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-2">
                            <span className="text-sm font-bold text-foreground">Filters</span>
                            <button type="button" onClick={closeSheet} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close filters">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col px-4 pb-2">{MobileBody}</div>
                        <div className="shrink-0 bg-card px-4" style={{ paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}>{Footer}</div>
                    </div>
                </>,
                document.body,
            )}
        </div>
    );
}
