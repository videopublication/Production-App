'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Assignment, Equipment, Shoot, Transaction, User } from '@/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Skeleton } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { useEquipment } from '@/hooks/useEquipment';
import { useTransactions } from '@/hooks/useTransactions';
import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useUsers } from '@/hooks/useUsers';
import { canManageDataAssets, compareCardNumbers, getCardNumber, isCard } from '@/lib/data-assets';
import { downloadCSV } from '@/lib/finance-utils';
import { Search } from 'lucide-react';

/**
 * The data team's shoot report — the replacement for their Google Form + Sheet.
 *
 * Every column except "Zoom recorder" is derived from data the app already holds: event
 * details from the linked shoot, cameras and cards from the transaction's equipment items,
 * and the camera people from the shoot's crew assignments. The Zoom answer is collected
 * when the cards come back (see the Returns page) and stored on the transaction.
 *
 * One row per transaction that included at least one card, since that is the event of
 * cards being taken out for a shoot.
 */

interface ReportRow {
    transactionId: string;
    eventName: string;
    location: string;
    date: string;          // ISO, for sorting
    dateLabel: string;
    camerasUsed: string;
    zoomRecorder: 'Yes' | 'No' | '—';
    cardNumbers: string[];
    cameraPeople: string[];
    outstanding: number;   // cards still not back
    returnedLabel: string;
}

const isCameraCategory = (category?: string) => (category || '').trim().toLowerCase() === 'camera';

const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function DataReportPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { hasFeature, isLoading: deptLoading } = useDepartment();

    const { data: equipment = [], isLoading: equipmentLoading } = useEquipment();
    const { data: transactions = [], isLoading: txnLoading } = useTransactions();
    const { data: shoots = [] } = useShoots();
    const { data: assignments = [] } = useAssignments();
    const { data: users = [] } = useUsers();

    const [search, setSearch] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const allowed = canManageDataAssets(user);

    useEffect(() => {
        if (authLoading || deptLoading) return;
        if (!user) {
            router.replace('/login');
            return;
        }
        if (!allowed) router.replace('/dashboard');
    }, [user, authLoading, deptLoading, allowed, router]);

    const rows = useMemo<ReportRow[]>(() => {
        const itemById = new Map<string, Equipment>(equipment.map((e: Equipment) => [e.id, e]));
        const userById = new Map<string, User>(users.map((u: User) => [u.id, u]));

        return transactions
            .map((txn: Transaction) => {
                const items = txn.items.map(id => itemById.get(id)).filter((i): i is Equipment => Boolean(i));
                const cards = items.filter(isCard);
                if (cards.length === 0) return null;

                const shoot = txn.shootId ? shoots.find((s: Shoot) => s.id === txn.shootId) : undefined;

                // Live shoot assignments are the source of truth when the transaction is
                // shoot-linked, matching how the transaction detail page resolves crew;
                // otherwise fall back to the transaction's own user snapshot.
                const crewIds = shoot
                    ? assignments
                        .filter((a: Assignment) => a.shootId === shoot.id && ['ACCEPTED', 'PENDING'].includes(a.status))
                        .map((a: Assignment) => a.userId)
                    : [txn.userId, ...(txn.additionalUsers || [])];
                const cameraPeople = Array.from(new Set([txn.userId, ...crewIds]))
                    .map(id => userById.get(id)?.name || userById.get(id)?.email)
                    .filter((n): n is string => Boolean(n));

                const returned = cards.filter(c => txn.postReturnConditions?.[c.id] !== undefined).length;

                return {
                    transactionId: txn.id,
                    eventName: shoot?.title || txn.project || 'Unspecified',
                    location: shoot?.location || '—',
                    date: shoot?.startTime || txn.timestampOut,
                    dateLabel: formatDate(shoot?.startTime || txn.timestampOut),
                    camerasUsed: items.filter(i => isCameraCategory(i.category)).map(i => i.name).join(', ') || '—',
                    zoomRecorder: txn.dataReport?.zoomRecorderUsed === true
                        ? 'Yes'
                        : txn.dataReport?.zoomRecorderUsed === false ? 'No' : '—',
                    cardNumbers: cards.map(c => getCardNumber(c) || c.barcode).sort(compareCardNumbers),
                    cameraPeople,
                    outstanding: cards.length - returned,
                    returnedLabel: txn.timestampIn ? formatDate(txn.timestampIn) : '—',
                } as ReportRow;
            })
            .filter((r): r is ReportRow => r !== null)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, equipment, shoots, assignments, users]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(row => {
            if (fromDate && row.date < fromDate) return false;
            if (toDate && row.date > `${toDate}T23:59:59`) return false;
            if (!q) return true;
            return [row.eventName, row.location, row.camerasUsed, row.cardNumbers.join(' '), row.cameraPeople.join(' ')]
                .join(' ')
                .toLowerCase()
                .includes(q);
        });
    }, [rows, search, fromDate, toDate]);

    const exportCsv = () => {
        const headers = ['Event Name', 'Location', 'Event Date', 'Cameras Used', 'Zoom Recorder', 'Cards Taken', 'Camera Person', 'Cards Outstanding', 'Returned On'];
        const quote = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
        const body = filtered.map(row => [
            quote(row.eventName),
            quote(row.location),
            row.dateLabel,
            quote(row.camerasUsed),
            row.zoomRecorder,
            quote(row.cardNumbers.join(', ')),
            quote(row.cameraPeople.join(', ')),
            String(row.outstanding),
            row.returnedLabel,
        ].join(','));
        const csv = [headers.join(','), ...body].join('\n');
        downloadCSV(
            new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
            `data_report_${new Date().toISOString().split('T')[0]}.csv`,
        );
    };

    if (authLoading || deptLoading || !user || !allowed) {
        return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
    }

    if (!hasFeature('data_assets')) {
        return (
            <div className="max-w-2xl mx-auto py-16 text-center">
                <h1 className="text-xl font-bold text-foreground">Data Report</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    This department doesn&apos;t use data-team assets. A Super Admin can enable it
                    under Departments.
                </p>
            </div>
        );
    }

    const isLoading = equipmentLoading || txnLoading;

    return (
        <div className="max-w-6xl mx-auto space-y-4 animate-fade-in pb-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Data Report</h1>
                    <p className="mt-1 text-[15px] text-muted-foreground">
                        Every shoot that took cards out, and what came back.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
                    Export CSV
                </Button>
            </div>

            <Card className="p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3">
                        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <input
                            type="search"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search event, location, card number, person…"
                            className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={fromDate}
                            onChange={e => setFromDate(e.target.value)}
                            aria-label="From date"
                            className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input
                            type="date"
                            value={toDate}
                            onChange={e => setToDate(e.target.value)}
                            aria-label="To date"
                            className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                </div>
            </Card>

            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                    {rows.length === 0
                        ? 'No shoot has taken cards out through the app yet.'
                        : 'No rows match these filters.'}
                </div>
            ) : (
                <>
                    {/* Desktop table */}
                    <Card className="hidden md:block p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">Event</th>
                                        <th className="px-4 py-3 font-semibold">Date</th>
                                        <th className="px-4 py-3 font-semibold">Cameras</th>
                                        <th className="px-4 py-3 font-semibold">Zoom</th>
                                        <th className="px-4 py-3 font-semibold">Cards</th>
                                        <th className="px-4 py-3 font-semibold">Camera Person</th>
                                        <th className="px-4 py-3 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filtered.map(row => (
                                        <tr key={row.transactionId} className="hover:bg-muted/40">
                                            <td className="px-4 py-3">
                                                <Link href={`/transactions/${row.transactionId}`} className="font-semibold text-foreground hover:text-primary">
                                                    {row.eventName}
                                                </Link>
                                                <p className="text-xs text-muted-foreground">{row.location}</p>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.dateLabel}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{row.camerasUsed}</td>
                                            <td className="px-4 py-3">
                                                <Badge variant={row.zoomRecorder === 'Yes' ? 'success' : row.zoomRecorder === 'No' ? 'secondary' : 'warning'}>
                                                    {row.zoomRecorder}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-[13px] text-foreground">{row.cardNumbers.join(', ')}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{row.cameraPeople.join(', ') || '—'}</td>
                                            <td className="px-4 py-3">
                                                {row.outstanding > 0
                                                    ? <Badge variant="orange">{row.outstanding} out</Badge>
                                                    : <Badge variant="success">All back</Badge>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Mobile cards */}
                    <div className="space-y-2 md:hidden">
                        {filtered.map(row => (
                            <Card key={row.transactionId} className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <Link href={`/transactions/${row.transactionId}`} className="font-semibold text-foreground">
                                            {row.eventName}
                                        </Link>
                                        <p className="text-xs text-muted-foreground">{row.location} · {row.dateLabel}</p>
                                    </div>
                                    {row.outstanding > 0
                                        ? <Badge variant="orange">{row.outstanding} out</Badge>
                                        : <Badge variant="success">All back</Badge>}
                                </div>
                                <dl className="mt-2 space-y-1 text-[13px]">
                                    <div className="flex gap-2">
                                        <dt className="w-24 shrink-0 text-muted-foreground">Cards</dt>
                                        <dd className="font-mono text-foreground">{row.cardNumbers.join(', ')}</dd>
                                    </div>
                                    <div className="flex gap-2">
                                        <dt className="w-24 shrink-0 text-muted-foreground">Cameras</dt>
                                        <dd className="min-w-0 text-foreground">{row.camerasUsed}</dd>
                                    </div>
                                    <div className="flex gap-2">
                                        <dt className="w-24 shrink-0 text-muted-foreground">Zoom</dt>
                                        <dd className="text-foreground">{row.zoomRecorder}</dd>
                                    </div>
                                    <div className="flex gap-2">
                                        <dt className="w-24 shrink-0 text-muted-foreground">Camera person</dt>
                                        <dd className="min-w-0 text-foreground">{row.cameraPeople.join(', ') || '—'}</dd>
                                    </div>
                                </dl>
                            </Card>
                        ))}
                    </div>

                    <p className="px-1 text-xs text-muted-foreground">
                        Showing {filtered.length} of {rows.length} shoots. Only shoots whose cards were
                        checked out through the app appear here.
                    </p>
                </>
            )}
        </div>
    );
}
