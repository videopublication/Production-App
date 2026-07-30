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
        const showSearch = group.options.length > 8;
        const opts = q ? group.options.filter(o => o.label.toLowerCase().includes(q)) : group.options;
        const allShownSelected = opts.length > 0 && opts.every(o => group.selected.includes(o.value));
        return (
            <div className={fill ? 'flex min-h-0 flex-1 flex-col' : ''}>
                <div className="mb-1 flex shrink-0 items-center justify-between px-1">
                    <span className="text-[11px] text-muted-foreground">{group.options.length} option{group.options.length !== 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => { const set = new Set(group.selected); opts.forEach(o => set.add(o.value)); group.onChange(Array.from(set)); }}
                            disabled={allShownSelected}
                            className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
                        >
                            {q ? 'Select shown' : 'Select all'}
                        </button>
                        <button
                            type="button"
                            onClick={() => group.onChange([])}
                            disabled={count === 0}
                            className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
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
                        className="mb-2 h-9 w-full shrink-0 rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:ring-2 focus:ring-primary"
                    />
                )}

                <div className={`grid grid-cols-1 gap-0.5 overflow-y-auto ${fill ? 'min-h-0 flex-1' : ''}`} style={fill ? undefined : { maxHeight: '14rem' }}>
                    {opts.length === 0 ? (
                        <p className="px-1 py-2 text-[13px] text-muted-foreground">No matches.</p>
                    ) : opts.map(o => {
                        const checked = group.selected.includes(o.value);
                        return (
                            <label
                                key={o.value}
                                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[14px] transition-colors focus-within:ring-2 focus-within:ring-primary ${checked ? 'bg-primary/5 text-primary font-semibold dark:bg-primary/15' : 'text-foreground hover:bg-muted'}`}
                            >
                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${checked ? 'border-primary bg-primary text-white' : 'border-border bg-background'}`}>
                                    {checked && (
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
        <div className="space-y-2">
            {usable.map(group => {
                const isExpanded = group.key === activeKey;
                const count = group.selected.length;
                return (
                    <div key={group.key} className="overflow-hidden rounded-xl border border-border">
                        <button
                            type="button"
                            onClick={() => setOpenKey(isExpanded ? '' : group.key)}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${isExpanded ? 'bg-secondary/50' : 'hover:bg-muted'}`}
                            aria-expanded={isExpanded}
                        >
                            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                {group.label}
                                {count > 0 && (
                                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{count}</span>
                                )}
                            </span>
                            <svg className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {isExpanded && (
                            <div className="border-t border-border p-2">{GroupPanel(group, false)}</div>
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
                            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-foreground hover:bg-secondary'}`}
                            aria-pressed={isActive}
                        >
                            {group.label}
                            {count > 0 && (
                                <span className={`rounded-full px-1.5 text-[10px] font-bold leading-4 ${isActive ? 'bg-white/25 text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>
            {activeGroup && GroupPanel(activeGroup, true)}
        </div>
    );

    const Footer = (
        <div className="flex items-center justify-between gap-3 border-t border-border px-1 pt-3">
            <button
                type="button"
                onClick={clearAll}
                disabled={totalSelected === 0}
                className="text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
                Clear all
            </button>
            <button
                type="button"
                onClick={closeSheet}
                className="rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground hover:opacity-90"
            >
                Show {resultCount} item{resultCount !== 1 ? 's' : ''}
            </button>
        </div>
    );

    if (usable.length === 0) return null;

    return (
        <div className={`flex flex-wrap items-center gap-2 ${className}`}>
            <div className="relative">
                <button
                    ref={btnRef}
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${open || totalSelected > 0 ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border bg-secondary/40 text-foreground hover:bg-secondary'}`}
                    aria-expanded={open}
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 12h12M10 20h4" />
                    </svg>
                    Filters
                    {totalSelected > 0 && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">{totalSelected}</span>
                    )}
                    <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* Desktop popover */}
                {open && !isMobile && (
                    <div
                        ref={popRef}
                        className="absolute left-0 z-[120] mt-2 rounded-2xl border border-border bg-card p-4 shadow-2xl"
                        style={{ width: '22rem', maxWidth: 'calc(100vw - 2rem)' }}
                    >
                        <div className="overflow-y-auto pr-1" style={{ maxHeight: '26rem' }}>{Body}</div>
                        <div className="mt-3">{Footer}</div>
                    </div>
                )}
            </div>

            {/* Active-filter chips */}
            {chips.map(chip => (
                <button
                    key={`${chip.group.key}:${chip.value}`}
                    type="button"
                    onClick={() => removeOne(chip.group, chip.value)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 py-1 pl-3 pr-2 text-[13px] font-medium text-primary transition-colors hover:bg-primary/20"
                    title={`Remove ${chip.group.label}: ${chip.label}`}
                >
                    <span className="max-w-[10rem] truncate">{chip.label}</span>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            ))}
            {totalSelected > 0 && (
                <button type="button" onClick={clearAll} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">
                    Clear all
                </button>
            )}

            {/* Mobile bottom sheet */}
            {open && isMobile && typeof document !== 'undefined' && createPortal(
                <>
                    <div className="fixed inset-0 z-[155] bg-black/40 backdrop-blur-sm" onClick={closeSheet} />
                    <div className="fixed inset-x-0 bottom-0 z-[160] flex flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl" style={{ height: '85vh' }}>
                        {/* grab handle */}
                        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
                        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-2">
                            <span className="text-base font-bold text-foreground">Filters</span>
                            <button type="button" onClick={closeSheet} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close filters">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
