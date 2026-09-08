'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { logActionVariant } from '@/lib/log-display';
import { Log, User } from '@/types';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { Badge } from '@/components/Badge';
import { PullToRefresh } from '@/components/PullToRefresh';

const ACTION_FILTERS = [
    { id: 'ALL', label: 'All' },
    { id: 'CHECKOUT', label: 'Checkout' },
    { id: 'RETURN', label: 'Return' },
    { id: 'EDIT', label: 'Edit' },
    { id: 'CREATE', label: 'Create' },
    { id: 'DELETE', label: 'Delete' },
    { id: 'VERIFY', label: 'Verify' },
    { id: 'LOGIN', label: 'Login' },
    { id: 'SIGNUP', label: 'Signup' },
    { id: 'LOGOUT', label: 'Logout' },
    { id: 'LOGIN_FAILED', label: 'Login Failed' },
];

export default function AdminLogsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [logs, setLogs] = useState<Log[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterAction, setFilterAction] = useState<string>('ALL');
    const { department } = useDepartment();
    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Reset when search or filter changes
    useEffect(() => {
        setPage(1);
        setLogs([]);
        setHasMore(true);
        loadData(1, true);
    }, [debouncedSearch, filterAction, activeDepartmentId]);

    useEffect(() => {
        if (!user) return;
        if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            router.push('/dashboard');
            return;
        }
        storage.getUsers().then(setUsers);
        // Initial load is handled by the search effect above
    }, [user, router, activeDepartmentId]);

    const loadData = async (pageNum: number = 1, isReset: boolean = false) => {
        setLoading(true);
        try {
            const limit = 20;
            const actionFilter = filterAction !== 'ALL' ? filterAction : undefined;
            const newLogs = await storage.getLogs(pageNum, limit, debouncedSearch, activeDepartmentId || undefined, actionFilter);

            if (newLogs.length < limit) {
                setHasMore(false);
            } else {
                setHasMore(true);
            }

            if (isReset) {
                setLogs(newLogs);
            } else {
                setLogs(prev => {
                    const existingIds = new Set(prev.map(l => l.id));
                    const uniqueNew = newLogs.filter(l => !existingIds.has(l.id));
                    return [...prev, ...uniqueNew];
                });
            }
        } catch (error) {
            console.error('Error loading logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        loadData(nextPage, false);
    };

    const handleRefresh = async () => {
        setPage(1);
        setHasMore(true);
        await loadData(1, true);
    };

    const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

    const toggleExpand = (logId: string) => {
        setExpandedLogIds(prev => {
            const next = new Set(prev);
            if (next.has(logId)) next.delete(logId);
            else next.add(logId);
            return next;
        });
    };

    const getLogItems = (log: Log): string[] => {
        if (!log.newValue || typeof log.newValue !== 'object') return [];
        const nv = log.newValue as Record<string, unknown>;
        const items: string[] = [];
        if (Array.isArray(nv.itemNames)) {
            items.push(...nv.itemNames.filter((n): n is string => typeof n === 'string'));
        }
        if (Array.isArray(nv.addedItemNames)) {
            items.push(...nv.addedItemNames.filter((n): n is string => typeof n === 'string'));
        }
        if (Array.isArray(nv.manualItems)) {
            nv.manualItems.forEach((m: any) => {
                if (m && typeof m.name === 'string') {
                    items.push(`${m.name} (Qty: ${m.quantity || 1})`);
                }
            });
        }
        return items;
    };

    const getUserName = (userId?: string) => {
        if (!userId) return 'System / Guest';
        const found = users.find(u => u.id === userId);
        return found?.name || found?.email || 'Unknown User';
    };

    const getActionVariant = logActionVariant;

    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        return null; // Or unauthorized view
    }

    return (
        <div className="space-y-3.5 max-w-[1400px] xl:max-w-[1600px] mx-auto animate-fade-in pb-10">
            {/* Compact Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Activity Logs</h1>
                    <p className="text-[12.5px] text-muted-foreground mt-0.5">
                        Audit trail of all system activities
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => handleRefresh()}
                    className="h-8 px-2.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-xs font-medium inline-flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all shrink-0"
                    title="Refresh activity logs"
                >
                    <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-card p-3 rounded-xl border border-border shadow-2xs space-y-2.5">
                {/* Compact Search Input */}
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search logs by keyword, item name, barcode, serial number, project, user..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-8.5 rounded-lg border border-border bg-background/50 focus:bg-background pl-8.5 pr-8 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1.5 focus:ring-primary shadow-2xs transition-all"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-muted"
                            title="Clear search"
                        >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Sleek Action Filter Badges */}
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5">
                    {ACTION_FILTERS.map(({ id, label }) => {
                        const active = filterAction === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setFilterAction(id)}
                                className={`whitespace-nowrap shrink-0 h-6.5 px-2.5 rounded-md text-[11.5px] font-medium transition-all ${
                                    active
                                        ? 'bg-primary text-primary-foreground shadow-2xs font-semibold'
                                        : 'bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40'
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <PullToRefresh onRefresh={handleRefresh}>
                {/* Desktop / Laptop View Table (Compact & Proportional) */}
                <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border text-[11px] uppercase tracking-wider">
                                <tr>
                                    <th className="px-3.5 py-2 min-w-[140px]">Date & Time</th>
                                    <th className="px-3.5 py-2 min-w-[120px]">User</th>
                                    <th className="px-3.5 py-2 min-w-[90px]">Action</th>
                                    <th className="px-3.5 py-2 w-full">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {logs.length === 0 && !loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">No logs found</td>
                                    </tr>
                                ) : (
                                    logs.map((log, index) => {
                                        const items = getLogItems(log);
                                        const hasItems = items.length > 0;
                                        const isExpanded = expandedLogIds.has(log.id);
                                        const matchedItems = debouncedSearch.trim()
                                            ? items.filter(item => item.toLowerCase().includes(debouncedSearch.toLowerCase().trim()))
                                            : [];

                                        return (
                                            <tr key={`${log.id}-${index}`} className="hover:bg-muted/30 transition-colors align-top">
                                                <td className="px-3.5 py-2.5 whitespace-nowrap text-[11.5px] text-muted-foreground">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </td>
                                                <td className="px-3.5 py-2.5 whitespace-nowrap font-medium text-[12.5px] text-foreground">
                                                    {getUserName(log.userId)}
                                                </td>
                                                <td className="px-3.5 py-2.5 whitespace-nowrap">
                                                    <Badge variant={getActionVariant(log.action)} className="text-[10px] px-2 py-0 rounded-md font-semibold tracking-wide">
                                                        {log.action}
                                                    </Badge>
                                                </td>
                                                <td className="px-3.5 py-2.5">
                                                    <div className="space-y-1">
                                                        <p className="text-foreground/90 text-[12px] leading-relaxed font-normal">
                                                            {log.details || '-'}
                                                        </p>

                                                        {/* Matched items indicator when searching */}
                                                        {matchedItems.length > 0 && !isExpanded && (
                                                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                                                <span className="text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                                                    Matched:
                                                                </span>
                                                                {matchedItems.slice(0, 3).map((item, i) => (
                                                                    <span key={i} className="inline-flex items-center text-[10.5px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.5 rounded-md">
                                                                        {item}
                                                                    </span>
                                                                ))}
                                                                {matchedItems.length > 3 && (
                                                                    <span className="text-[10px] text-muted-foreground">+{matchedItems.length - 3} more</span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Toggle button to see all items */}
                                                        {hasItems && (
                                                            <div className="pt-0.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExpand(log.id)}
                                                                    className="inline-flex items-center gap-1 text-[10.5px] font-medium text-primary hover:text-primary/80 transition-colors"
                                                                >
                                                                    <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                    </svg>
                                                                    {isExpanded ? 'Hide items' : `View ${items.length} item${items.length === 1 ? '' : 's'}`}
                                                                </button>

                                                                {isExpanded && (
                                                                    <div className="mt-1.5 flex flex-wrap gap-1 p-2 bg-muted/30 rounded-lg border border-border/50 max-h-48 overflow-y-auto">
                                                                        {items.map((item, i) => {
                                                                            const isMatch = debouncedSearch.trim() && item.toLowerCase().includes(debouncedSearch.toLowerCase().trim());
                                                                            return (
                                                                                <span
                                                                                    key={i}
                                                                                    className={`text-[10.5px] px-1.5 py-0.5 rounded border ${isMatch
                                                                                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 font-semibold'
                                                                                        : 'bg-card text-foreground border-border/70'
                                                                                    }`}
                                                                                >
                                                                                    {item}
                                                                                </span>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile View List */}
                <div className="md:hidden space-y-2.5">
                    {logs.length === 0 && !loading ? (
                        <div className="text-center py-8 bg-card rounded-xl border border-border text-xs text-muted-foreground">
                            No logs found
                        </div>
                    ) : (
                        logs.map((log, index) => {
                            const items = getLogItems(log);
                            const hasItems = items.length > 0;
                            const isExpanded = expandedLogIds.has(log.id);
                            const matchedItems = debouncedSearch.trim()
                                ? items.filter(item => item.toLowerCase().includes(debouncedSearch.toLowerCase().trim()))
                                : [];

                            return (
                                <div key={`${log.id}-${index}`} className="bg-card p-3 rounded-xl border border-border shadow-2xs space-y-2">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="space-y-0.5 min-w-0">
                                            <p className="font-semibold text-[13px] text-foreground truncate">{getUserName(log.userId)}</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                        <Badge variant={getActionVariant(log.action)} className="text-[10px] px-1.5 py-0 rounded shrink-0">
                                            {log.action}
                                        </Badge>
                                    </div>
                                    <div className="bg-muted/30 p-2 rounded-lg border border-border/40 space-y-1.5">
                                        <p className="text-[12px] text-foreground/90 leading-snug">
                                            {log.details || 'No details provided'}
                                        </p>

                                        {matchedItems.length > 0 && !isExpanded && (
                                            <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-border/40">
                                                <span className="text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-1 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                                    Matched:
                                                </span>
                                                {matchedItems.slice(0, 2).map((item, i) => (
                                                    <span key={i} className="text-[10.5px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.5 rounded">
                                                        {item}
                                                    </span>
                                                ))}
                                                {matchedItems.length > 2 && (
                                                    <span className="text-[10px] text-muted-foreground">+{matchedItems.length - 2} more</span>
                                                )}
                                            </div>
                                        )}

                                        {hasItems && (
                                            <div className="pt-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleExpand(log.id)}
                                                    className="inline-flex items-center gap-1 text-[10.5px] font-medium text-primary hover:text-primary/80 transition-colors"
                                                >
                                                    <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                    {isExpanded ? 'Hide items' : `View ${items.length} item${items.length === 1 ? '' : 's'}`}
                                                </button>

                                                {isExpanded && (
                                                    <div className="mt-1.5 flex flex-wrap gap-1 p-1.5 bg-background/80 dark:bg-background/50 rounded-md border border-border/50 max-h-40 overflow-y-auto">
                                                        {items.map((item, i) => {
                                                            const isMatch = debouncedSearch.trim() && item.toLowerCase().includes(debouncedSearch.toLowerCase().trim());
                                                            return (
                                                                <span
                                                                    key={i}
                                                                    className={`text-[10.5px] px-1.5 py-0.5 rounded border ${isMatch
                                                                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 font-semibold'
                                                                        : 'bg-muted/40 text-foreground border-border/70'
                                                                    }`}
                                                                >
                                                                    {item}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Load More & Loading State */}
                <div className="pt-3 flex justify-center">
                    {loading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                            <div className="animate-spin w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full"></div>
                            Loading logs...
                        </div>
                    ) : hasMore ? (
                        <button
                            type="button"
                            onClick={handleLoadMore}
                            className="h-8 px-4 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-xs font-semibold shadow-2xs active:scale-95 transition-all"
                        >
                            Load More
                        </button>
                    ) : logs.length > 0 ? (
                        <p className="text-[11px] text-muted-foreground">No more logs to load</p>
                    ) : null}
                </div>
            </PullToRefresh>
        </div>
    );
}
