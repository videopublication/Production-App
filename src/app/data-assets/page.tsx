'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Equipment, EquipmentStatus, User } from '@/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Skeleton } from '@/components/Skeleton';
import { ItemIdentity } from '@/components/ItemIdentity';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { useEquipment, useUpdateEquipment } from '@/hooks/useEquipment';
import { useUsers } from '@/hooks/useUsers';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/dialog-context';
import { storage } from '@/lib/storage';
import { canManageDataAssets, compareCardNumbers, getCardNumber, isCard, isDataAsset } from '@/lib/data-assets';
import { getEquipmentIssue, getIssueSummary, hasEquipmentIssue } from '@/lib/equipment-issues';
import { downloadFile } from '@/lib/download';
import { Search } from 'lucide-react';

/**
 * The data team's own catalogue.
 *
 * Deliberately separate from /inventory: the two teams custody different kit and mixing
 * them made both lists harder to work with. These are still ordinary equipment rows, so
 * they go out through the same checkout as the gear and come back through the same
 * returns page — only the management surface is split.
 */

type StatusTab = 'ALL' | 'AVAILABLE' | 'CHECKED_OUT' | 'PENDING_VERIFICATION' | 'ISSUE';

const STATUS_TABS: { id: StatusTab; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'AVAILABLE', label: 'Available' },
    { id: 'CHECKED_OUT', label: 'Out' },
    { id: 'PENDING_VERIFICATION', label: 'Awaiting data copy' },
    { id: 'ISSUE', label: 'Needs attention' },
];

const statusVariant = (status: EquipmentStatus) => {
    switch (status) {
        case 'AVAILABLE': return 'success' as const;
        case 'CHECKED_OUT': return 'orange' as const;
        case 'PENDING_VERIFICATION': return 'warning' as const;
        default: return 'destructive' as const;
    }
};

const statusLabel = (item: Equipment) => {
    if (item.status === 'PENDING_VERIFICATION') return isCard(item) ? 'Awaiting data copy' : 'Awaiting check';
    if (item.status === 'CHECKED_OUT') return 'Out';
    return item.status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

export default function DataAssetsPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { hasFeature, isLoading: deptLoading } = useDepartment();
    const { showToast } = useToast();
    const confirm = useConfirm();

    const { data: allItems = [], isLoading: itemsLoading, refetch: refresh } = useEquipment();
    const { data: usersList = [] } = useUsers();
    const { mutateAsync: updateEquipment } = useUpdateEquipment();

    const [search, setSearch] = useState('');
    const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [isBusy, setIsBusy] = useState(false);

    const allowed = canManageDataAssets(user);

    useEffect(() => {
        if (authLoading || deptLoading) return;
        if (!user) {
            router.replace('/login');
            return;
        }
        if (!allowed) router.replace('/dashboard');
    }, [user, authLoading, deptLoading, allowed, router]);

    const holderName = React.useCallback((id?: string) => {
        if (!id) return null;
        const found = usersList.find((u: User) => u.id === id);
        return found?.name || found?.email || id;
    }, [usersList]);

    const dataItems = useMemo(() => allItems.filter(isDataAsset), [allItems]);

    const counts = useMemo(() => ({
        total: dataItems.length,
        available: dataItems.filter(i => i.status === 'AVAILABLE' && !hasEquipmentIssue(i)).length,
        out: dataItems.filter(i => i.status === 'CHECKED_OUT').length,
        pending: dataItems.filter(i => i.status === 'PENDING_VERIFICATION').length,
        issues: dataItems.filter(hasEquipmentIssue).length,
    }), [dataItems]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase().replace(/[\s\-_]/g, '');
        return dataItems
            .filter(item => {
                if (statusTab === 'ISSUE') {
                    if (!hasEquipmentIssue(item) && !['DAMAGED', 'LOST', 'MAINTENANCE'].includes(item.status)) return false;
                } else if (statusTab !== 'ALL' && item.status !== statusTab) {
                    return false;
                }
                if (!q) return true;
                const hay = [item.name, item.category, item.barcode, getCardNumber(item), item.metadata?.brand, item.metadata?.model]
                    .filter(Boolean).join(' ').toLowerCase().replace(/[\s\-_]/g, '');
                return hay.includes(q);
            })
            .sort((a, b) => {
                // Cards read as a numbered set, so order them by number; everything else by name.
                const aNum = getCardNumber(a);
                const bNum = getCardNumber(b);
                if (isCard(a) && isCard(b) && aNum && bNum) return compareCardNumbers(aNum, bNum);
                if (isCard(a) !== isCard(b)) return isCard(a) ? -1 : 1;
                return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
            });
    }, [dataItems, search, statusTab]);

    const toggle = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // Hand an item back to the gear pool — the inverse of Inventory's "Move to data team".
    const moveBackToGear = async () => {
        if (selected.size === 0 || isBusy) return;
        const targets = dataItems.filter(i => selected.has(i.id));
        const ok = await confirm({
            title: `Move ${targets.length} item${targets.length === 1 ? '' : 's'} back to gear?`,
            message: 'They will appear in the main Inventory and be managed by the equipment managers instead.',
            confirmLabel: 'Move to gear',
        });
        if (!ok) return;

        setIsBusy(true);
        let failed = false;
        for (const item of targets) {
            try {
                const metadata = { ...(item.metadata || {}) };
                delete metadata.custodian;
                await updateEquipment({ id: item.id, updates: { metadata } });
                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: item.id,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Moved "${item.name}" (${item.barcode}) back to the gear pool`,
                        departmentId: item.departmentId,
                    });
                }
            } catch (e) {
                console.error('Move to gear failed:', e);
                failed = true;
            }
        }
        setIsBusy(false);
        showToast(failed ? 'Some items could not be moved' : `Moved ${targets.length} back to gear`, failed ? 'error' : 'success');
        setSelected(new Set());
        refresh();
    };

    const exportCsv = () => {
        const headers = ['Card Number', 'Name', 'Category', 'Barcode', 'Status', 'Held By', 'Issue'];
        const quote = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
        const rows = visible.map(item => [
            quote(getCardNumber(item)),
            quote(item.name),
            quote(item.category),
            item.barcode,
            statusLabel(item),
            quote(holderName(item.assignedTo) || ''),
            quote(hasEquipmentIssue(item) ? getIssueSummary(getEquipmentIssue(item)!) : ''),
        ].join(','));
        downloadFile(
            new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' }),
            `data_assets_${new Date().toISOString().split('T')[0]}.csv`,
            'text/csv',
        );
    };

    if (authLoading || deptLoading || !user || !allowed) {
        return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
    }

    if (!hasFeature('data_assets')) {
        return (
            <div className="max-w-2xl mx-auto py-16 text-center">
                <h1 className="text-xl font-bold text-foreground">Data Assets</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    This department doesn&apos;t use data-team assets. A Super Admin can enable it under Departments.
                </p>
            </div>
        );
    }

    return (
        <PullToRefresh onRefresh={async () => { await refresh(); }}>
            <div className="max-w-5xl mx-auto space-y-4 animate-fade-in pb-12">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Data Assets</h1>
                        <p className="mt-1 text-[15px] text-muted-foreground">
                            Cards, drives and everything else the data team lend out.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
                            Export
                        </Button>
                        <Link href="/inventory/add?custodian=data">
                            <Button size="sm">+ Add Item</Button>
                        </Link>
                    </div>
                </div>

                {/* At-a-glance: what's lendable right now vs stuck waiting on the team. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                        { label: 'Ready to lend', value: counts.available, tone: 'text-emerald-600 dark:text-emerald-400' },
                        { label: 'Out', value: counts.out, tone: 'text-orange-600 dark:text-orange-400' },
                        { label: 'Awaiting data copy', value: counts.pending, tone: 'text-cyan-600 dark:text-cyan-400' },
                        { label: 'Needs attention', value: counts.issues, tone: 'text-red-600 dark:text-red-400' },
                    ].map(stat => (
                        <Card key={stat.label} className="p-3">
                            <p className={`text-2xl font-bold leading-none ${stat.tone}`}>{stat.value}</p>
                            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                        </Card>
                    ))}
                </div>

                <div className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-secondary/40 px-3">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search card number, name, barcode…"
                        className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                    />
                </div>

                <div className="w-full overflow-x-auto scrollbar-hide">
                    <div className="flex gap-1.5 pb-0.5">
                        {STATUS_TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setStatusTab(tab.id)}
                                className={`whitespace-nowrap flex-shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${statusTab === tab.id
                                    ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-black'
                                    : 'bg-transparent text-[#86868b] hover:bg-[#e8e8ed] dark:hover:bg-[#2c2c2e]'
                                    }`}
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {selected.size > 0 && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2">
                        <span className="text-sm font-medium text-foreground">{selected.size} selected</span>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="text-muted-foreground">
                                Clear
                            </Button>
                            <Button variant="outline" size="sm" onClick={moveBackToGear} isLoading={isBusy}>
                                Move to gear
                            </Button>
                        </div>
                    </div>
                )}

                {itemsLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                    </div>
                ) : visible.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                        {dataItems.length === 0
                            ? 'No data-team items yet. Add one, or select gear in Inventory and choose "Move to data team".'
                            : 'Nothing matches these filters.'}
                    </div>
                ) : (
                    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                        {visible.map(item => {
                            const issue = getEquipmentIssue(item);
                            const holder = holderName(item.assignedTo);
                            return (
                                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
                                    <input
                                        type="checkbox"
                                        checked={selected.has(item.id)}
                                        onChange={() => toggle(item.id)}
                                        className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                                        aria-label={`Select ${item.name}`}
                                    />
                                    <Link href={`/inventory/${encodeURIComponent(item.barcode)}`} className="min-w-0 flex-1">
                                        <ItemIdentity item={item} variant="md" />
                                        {holder && (
                                            <p className="mt-0.5 text-[11px] text-muted-foreground">With {holder}</p>
                                        )}
                                        {issue && (
                                            <p className="mt-0.5 truncate text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                                {getIssueSummary(issue)}
                                            </p>
                                        )}
                                    </Link>
                                    <Badge variant={hasEquipmentIssue(item) && item.status === 'AVAILABLE' ? 'warning' : statusVariant(item.status)}>
                                        {hasEquipmentIssue(item) && item.status === 'AVAILABLE' ? 'Issue' : statusLabel(item)}
                                    </Badge>
                                </div>
                            );
                        })}
                    </div>
                )}

                <p className="px-1 text-xs text-muted-foreground">
                    Showing {visible.length} of {counts.total} items. These are lent out through the
                    normal Checkout alongside camera gear.
                </p>
            </div>
        </PullToRefresh>
    );
}
