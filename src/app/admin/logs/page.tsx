'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { logActionVariant } from '@/lib/log-display';
import { Log, User } from '@/types';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useEquipment } from '@/hooks/useEquipment';
import { useTransactions } from '@/hooks/useTransactions';
import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { downloadCSV } from '@/lib/finance-utils';
import {
    buildCategoryReports,
    formatDurationLabel,
    generateActivityLogsCSV,
    generateCrewBreakdownCSV,
    generateMasterCategoryReportCSV,
    generateShootLogReportCSV,
    generateUsageReportCSV,
    itemMatchesCategory,
    logMatchesCategory,
    normalizeCategoryLabel,
    ReportTabId,
    UsageSortField,
} from '@/lib/activity-reports';
import {
    Activity,
    BarChart3,
    Calendar,
    Download,
    FileSpreadsheet,
    Film,
    Filter,
    RefreshCw,
    Search,
    TrendingUp,
    Users as UsersIcon,
    X,
} from 'lucide-react';

const ACTION_FILTERS = [
    { id: 'ALL', label: 'All Actions' },
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

const REPORT_TABS: Array<{
    id: ReportTabId;
    label: string;
    shortLabel: string;
    description: string;
}> = [
    {
        id: 'logs',
        label: 'Activity Stream',
        shortLabel: 'Logs',
        description: 'Chronological audit trail of checkouts, returns, edits & logins',
    },
    {
        id: 'usage',
        label: 'Usage & Popularity',
        shortLabel: 'Usage',
        description: 'Total checkouts, hours/days used, last used date & most/least used gear',
    },
    {
        id: 'shoots',
        label: 'Shoot-by-Shoot Log',
        shortLabel: 'Shoots Log',
        description: 'Every shoot that took gear out, crew assigned, cameras & return condition',
    },
    {
        id: 'crew',
        label: 'Crew Breakdown',
        shortLabel: 'Crew',
        description: 'Who uses which lenses or equipment most frequently & total hours out',
    },
];

type UsageSubsetFilter = 'ALL' | 'USED' | 'UNUSED' | 'OUT' | 'ISSUE';

export default function AdminLogsPage() {
    const router = useRouter();
    const { user } = useAuth();
    const { department } = useDepartment();
    const activeDepartmentId =
        user?.role === 'SUPER_ADMIN' ? department?.id || null : user?.departmentId;

    // Live data hooks for reports & category filtering
    const {
        data: equipment = [],
        isLoading: equipmentLoading,
        refetch: refetchEquipment,
    } = useEquipment();
    const {
        data: transactions = [],
        isLoading: transactionsLoading,
        refetch: refetchTransactions,
    } = useTransactions();
    const { data: shoots = [], refetch: refetchShoots } = useShoots();
    const { data: assignments = [], refetch: refetchAssignments } = useAssignments();

    const [activeTab, setActiveTab] = useState<ReportTabId>('logs');
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [fromDate, setFromDate] = useState<string>('');
    const [toDate, setToDate] = useState<string>('');
    const [usageSort, setUsageSort] = useState<UsageSortField>('checkouts_desc');
    const [usageSubset, setUsageSubset] = useState<UsageSubsetFilter>('ALL');

    const [logs, setLogs] = useState<Log[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [exportingLogs, setExportingLogs] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterAction, setFilterAction] = useState<string>('ALL');
    const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Build dynamic list of categories with Lens prioritized right after All Categories
    const categoryOptions = useMemo(() => {
        const counts = new Map<string, number>();
        for (const item of equipment) {
            const cat = normalizeCategoryLabel(item.category, item.barcode);
            counts.set(cat, (counts.get(cat) || 0) + 1);
        }
        // Ensure 'Lens' and 'Camera' appear even if equipment is still loading
        const priorityOrder = ['Lens', 'Camera', 'Audio', 'Lighting', 'Card', 'Battery', 'Tripod', 'Monitor'];
        const allCats = Array.from(counts.keys()).sort((a, b) => {
            const ia = priorityOrder.indexOf(a);
            const ib = priorityOrder.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return a.localeCompare(b);
        });

        if (!allCats.includes('Lens')) {
            allCats.unshift('Lens');
        }

        return [
            { id: 'ALL', label: 'All Categories', count: equipment.length },
            ...allCats.map(c => ({ id: c, label: c, count: counts.get(c) || 0 })),
        ];
    }, [equipment]);

    // Lookup sets for filtering Activity Logs by selectedCategory
    const categoryFilterSets = useMemo(() => {
        if (selectedCategory === 'ALL') {
            return {
                itemIds: new Set<string>(),
                barcodes: new Set<string>(),
                txnIds: new Set<string>(),
            };
        }
        const matchedItems = equipment.filter(i => itemMatchesCategory(i, selectedCategory));
        const itemIds = new Set(matchedItems.map(i => i.id));
        const barcodes = new Set(
            matchedItems.map(i => (i.barcode || '').trim().toLowerCase()).filter(Boolean)
        );
        const txnIds = new Set(
            transactions
                .filter(t => t.items.some(id => itemIds.has(id)))
                .map(t => t.id)
        );
        return { itemIds, barcodes, txnIds };
    }, [equipment, transactions, selectedCategory]);

    // Reset and reload logs when search, action, date range, category, or department changes
    useEffect(() => {
        setPage(1);
        setLogs([]);
        setHasMore(true);
        loadData(1, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearch, filterAction, fromDate, toDate, selectedCategory, activeDepartmentId]);

    useEffect(() => {
        if (!user) return;
        if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            router.push('/dashboard');
            return;
        }
        storage.getUsers().then(setUsers);
    }, [user, router, activeDepartmentId]);

    const loadData = async (pageNum: number = 1, isReset: boolean = false) => {
        setLoadingLogs(true);
        try {
            // Fetch a larger page when filtering client-side by category so results aren't sparse
            const limit = selectedCategory !== 'ALL' ? 120 : 25;
            const actionFilter = filterAction !== 'ALL' ? filterAction : undefined;
            const newLogs = await storage.getLogs(
                pageNum,
                limit,
                searchQuery,
                activeDepartmentId || undefined,
                actionFilter,
                fromDate || undefined,
                toDate || undefined
            );

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
            setLoadingLogs(false);
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
        await Promise.all([
            loadData(1, true),
            refetchEquipment(),
            refetchTransactions(),
            refetchShoots(),
            refetchAssignments(),
            storage.getUsers().then(setUsers),
        ]);
    };

    const applyDatePreset = (days: number | null) => {
        if (days === null) {
            setFromDate('');
            setToDate('');
            return;
        }
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        setFromDate(start.toISOString().split('T')[0]);
        setToDate(end.toISOString().split('T')[0]);
    };

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
            nv.manualItems.forEach((m: { name?: string; quantity?: number }) => {
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

    // Filter displayed logs by selectedCategory when on Activity Stream tab
    const visibleLogs = useMemo(() => {
        if (selectedCategory === 'ALL') return logs;
        return logs.filter(log =>
            logMatchesCategory({
                log,
                selectedCategory,
                categoryItemIds: categoryFilterSets.itemIds,
                categoryBarcodes: categoryFilterSets.barcodes,
                categoryTransactionIds: categoryFilterSets.txnIds,
            })
        );
    }, [logs, selectedCategory, categoryFilterSets]);

    // Build all structured category reports (Usage & Popularity, Shoot-by-Shoot Log, Crew Breakdown)
    const reportData = useMemo(() => {
        return buildCategoryReports({
            equipment,
            transactions,
            shoots,
            assignments,
            users,
            selectedCategory,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            searchQuery,
        });
    }, [
        equipment,
        transactions,
        shoots,
        assignments,
        users,
        selectedCategory,
        fromDate,
        toDate,
        searchQuery,
    ]);

    // Apply subset filter & sorting to Usage rows
    const displayedUsageRows = useMemo(() => {
        let list = [...reportData.usageRows];
        if (usageSubset === 'USED') list = list.filter(r => r.totalCheckouts > 0);
        if (usageSubset === 'UNUSED') list = list.filter(r => r.totalCheckouts === 0);
        if (usageSubset === 'OUT') list = list.filter(r => r.status === 'CHECKED_OUT');
        if (usageSubset === 'ISSUE') list = list.filter(r => r.hasIssue);

        list.sort((a, b) => {
            switch (usageSort) {
                case 'checkouts_desc':
                    return (
                        b.totalCheckouts - a.totalCheckouts ||
                        b.totalDaysUsed - a.totalDaysUsed || b.totalHoursUsed - a.totalHoursUsed ||
                        a.name.localeCompare(b.name)
                    );
                case 'checkouts_asc':
                    return (
                        a.totalCheckouts - b.totalCheckouts ||
                        a.totalHoursUsed - b.totalHoursUsed ||
                        a.name.localeCompare(b.name)
                    );
                case 'hours_desc':
                    return (
                        b.totalDaysUsed - a.totalDaysUsed || b.totalHoursUsed - a.totalHoursUsed ||
                        b.totalCheckouts - a.totalCheckouts
                    );
                case 'last_used_desc': {
                    const ta = a.lastUsedDate ? new Date(a.lastUsedDate).getTime() : 0;
                    const tb = b.lastUsedDate ? new Date(b.lastUsedDate).getTime() : 0;
                    return tb - ta || b.totalCheckouts - a.totalCheckouts;
                }
                case 'name_asc':
                    return a.name.localeCompare(b.name);
                default:
                    return 0;
            }
        });
        return list;
    }, [reportData.usageRows, usageSubset, usageSort]);

    const maxCheckoutsInView = useMemo(() => {
        return Math.max(1, ...reportData.usageRows.map(r => r.totalCheckouts));
    }, [reportData.usageRows]);

    const slugCategory =
        selectedCategory === 'ALL' ? 'all_equipment' : selectedCategory.toLowerCase().replace(/\s+/g, '_');
    const dateStamp = new Date().toISOString().split('T')[0];

    const handleExportCurrentTabCSV = async () => {
        if (activeTab === 'usage') {
            const csv = generateUsageReportCSV(displayedUsageRows);
            downloadCSV(
                new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
                `${slugCategory}_usage_popularity_${dateStamp}.csv`
            );
            return;
        }
        if (activeTab === 'shoots') {
            const csv = generateShootLogReportCSV(reportData.shootRows, selectedCategory);
            downloadCSV(
                new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
                `${slugCategory}_shoot_log_${dateStamp}.csv`
            );
            return;
        }
        if (activeTab === 'crew') {
            const csv = generateCrewBreakdownCSV(reportData.crewRows, selectedCategory);
            downloadCSV(
                new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
                `${slugCategory}_crew_breakdown_${dateStamp}.csv`
            );
            return;
        }

        // Active tab is 'logs' — fetch up to 1000 matching logs so the export isn't limited to the first 25 rows
        setExportingLogs(true);
        try {
            const actionFilter = filterAction !== 'ALL' ? filterAction : undefined;
            const fetchedLogs = await storage.getLogs(
                1,
                1000,
                searchQuery,
                activeDepartmentId || undefined,
                actionFilter,
                fromDate || undefined,
                toDate || undefined
            );
            const filteredForExport =
                selectedCategory === 'ALL'
                    ? fetchedLogs
                    : fetchedLogs.filter(log =>
                          logMatchesCategory({
                              log,
                              selectedCategory,
                              categoryItemIds: categoryFilterSets.itemIds,
                              categoryBarcodes: categoryFilterSets.barcodes,
                              categoryTransactionIds: categoryFilterSets.txnIds,
                          })
                      );
            const csv = generateActivityLogsCSV(filteredForExport, getUserName, getLogItems);
            downloadCSV(
                new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
                `${slugCategory}_activity_logs_${dateStamp}.csv`
            );
        } finally {
            setExportingLogs(false);
        }
    };

    const handleExportMasterReportCSV = () => {
        const csv = generateMasterCategoryReportCSV({
            categoryLabel: selectedCategory,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            summary: reportData.summary,
            usageRows: displayedUsageRows,
            shootRows: reportData.shootRows,
            crewRows: reportData.crewRows,
        });
        downloadCSV(
            new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
            `${slugCategory}_complete_data_report_${dateStamp}.csv`
        );
    };

    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        return null;
    }

    const isReportLoading = equipmentLoading || transactionsLoading;
    const categoryDisplayLabel = selectedCategory === 'ALL' ? 'All Equipment' : selectedCategory;

    return (
        <div className="space-y-3.5 max-w-[1400px] xl:max-w-[1600px] mx-auto animate-fade-in pb-12">
            {/* Header & Export Toolbar */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            Activity Logs &amp; Data Reports
                        </h1>
                        {selectedCategory !== 'ALL' && (
                            <Badge variant="default" className="text-xs px-2.5 py-0.5">
                                {selectedCategory} Report
                            </Badge>
                        )}
                    </div>
                    <p className="text-[12.5px] text-muted-foreground mt-0.5">
                        {REPORT_TABS.find(t => t.id === activeTab)?.description}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    <button
                        type="button"
                        onClick={handleExportCurrentTabCSV}
                        disabled={exportingLogs}
                        className="h-8.5 px-3 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        title="Export the currently visible tab as a CSV file"
                    >
                        <Download className="w-3.5 h-3.5 text-primary" />
                        {exportingLogs
                            ? 'Exporting…'
                            : activeTab === 'logs'
                            ? 'Export Logs CSV'
                            : activeTab === 'usage'
                            ? `Export ${categoryDisplayLabel} Usage CSV`
                            : activeTab === 'shoots'
                            ? `Export ${categoryDisplayLabel} Shoot Log CSV`
                            : `Export ${categoryDisplayLabel} Crew CSV`}
                    </button>

                    <button
                        type="button"
                        onClick={handleExportMasterReportCSV}
                        disabled={isReportLoading}
                        className="h-8.5 px-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        title="Export all 3 data reports (Usage & Popularity + Shoot-by-Shoot Log + Crew Breakdown) in one CSV file"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Export Full {categoryDisplayLabel} Report (CSV)
                    </button>

                    <button
                        type="button"
                        onClick={handleRefresh}
                        className="h-8.5 px-2.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-xs font-medium inline-flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all shrink-0 cursor-pointer"
                        title="Refresh activity logs & report data"
                    >
                        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="hidden sm:inline">Refresh</span>
                    </button>
                </div>
            </div>

            {/* Report Mode Switcher Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-card p-1.5 rounded-xl border border-border shadow-2xs">
                {REPORT_TABS.map(tab => {
                    const isActive = activeTab === tab.id;
                    const Icon =
                        tab.id === 'logs'
                            ? Activity
                            : tab.id === 'usage'
                            ? BarChart3
                            : tab.id === 'shoots'
                            ? Film
                            : UsersIcon;
                    const badgeCount =
                        tab.id === 'usage'
                            ? displayedUsageRows.length
                            : tab.id === 'shoots'
                            ? reportData.shootRows.length
                            : tab.id === 'crew'
                            ? reportData.crewRows.length
                            : null;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center justify-center sm:justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                isActive
                                    ? 'bg-primary text-primary-foreground shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                            }`}
                        >
                            <span className="inline-flex items-center gap-1.5 truncate">
                                <Icon className="w-3.5 h-3.5 shrink-0" />
                                <span className="hidden md:inline truncate">{tab.label}</span>
                                <span className="md:hidden truncate">{tab.shortLabel}</span>
                            </span>
                            {badgeCount !== null && (
                                <span
                                    className={`text-[10.5px] px-1.5 py-0.2 rounded-full font-mono ${
                                        isActive
                                            ? 'bg-primary-foreground/20 text-primary-foreground'
                                            : 'bg-muted text-muted-foreground'
                                    }`}
                                >
                                    {badgeCount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Unified Filter Card: Category Pills + Search + Date Range + Tab-specific Filters */}
            <div className="bg-card p-3 rounded-xl border border-border shadow-2xs space-y-2.5">
                {/* Equipment Category Filter Strip (Lens, Camera, Audio, etc.) */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-0.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pr-1 shrink-0">
                        <Filter className="w-3 h-3" />
                        Category:
                    </span>
                    {categoryOptions.map(cat => {
                        const active = selectedCategory === cat.id;
                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`whitespace-nowrap shrink-0 h-7 px-2.5 rounded-lg text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                                    active
                                        ? 'bg-primary text-primary-foreground shadow-2xs font-semibold'
                                        : 'bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/40'
                                }`}
                            >
                                <span>{cat.label}</span>
                                <span
                                    className={`text-[10px] px-1 rounded ${
                                        active
                                            ? 'bg-primary-foreground/20 text-primary-foreground'
                                            : 'bg-background/70 text-muted-foreground'
                                    }`}
                                >
                                    {cat.count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Search + Date Range Row */}
                <div className="flex flex-col lg:flex-row gap-2">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                            type="text"
                            placeholder={
                                activeTab === 'logs'
                                    ? 'Search logs by keyword, lens/item name, barcode, serial number, project, user...'
                                    : activeTab === 'usage'
                                    ? `Search ${categoryDisplayLabel.toLowerCase()} by name, brand, model, barcode, serial, crew...`
                                    : activeTab === 'shoots'
                                    ? 'Search shoot/event name, location, lens/item barcode, camera person...'
                                    : 'Search crew member name, role, or favorite equipment...'
                            }
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full h-8.5 rounded-lg border border-border bg-background/50 focus:bg-background pl-8.5 pr-8 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1.5 focus:ring-primary shadow-2xs transition-all"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-muted"
                                title="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Date Range Inputs & Quick Presets */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <div className="inline-flex items-center gap-1.5 bg-background/60 border border-border rounded-lg px-2 h-8.5">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <input
                                type="date"
                                value={fromDate}
                                onChange={e => setFromDate(e.target.value)}
                                aria-label="From date"
                                className="bg-transparent text-[11.5px] text-foreground outline-none"
                            />
                            <span className="text-[11px] text-muted-foreground">to</span>
                            <input
                                type="date"
                                value={toDate}
                                onChange={e => setToDate(e.target.value)}
                                aria-label="To date"
                                className="bg-transparent text-[11.5px] text-foreground outline-none"
                            />
                        </div>

                        <div className="inline-flex items-center gap-1">
                            {[
                                { label: 'All Time', days: null },
                                { label: '7D', days: 7 },
                                { label: '30D', days: 30 },
                                { label: '90D', days: 90 },
                            ].map(preset => {
                                const isAllTimeActive =
                                    preset.days === null && !fromDate && !toDate;
                                return (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => applyDatePreset(preset.days)}
                                        className={`h-8.5 px-2 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                                            isAllTimeActive
                                                ? 'bg-primary/10 text-primary border-primary/30 font-semibold'
                                                : 'bg-secondary/60 text-muted-foreground hover:text-foreground border-border/50'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Tab-specific secondary filters */}
                {activeTab === 'logs' && (
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5">
                        {ACTION_FILTERS.map(({ id, label }) => {
                            const active = filterAction === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setFilterAction(id)}
                                    className={`whitespace-nowrap shrink-0 h-6.5 px-2.5 rounded-md text-[11.5px] font-medium transition-all cursor-pointer ${
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
                )}

                {activeTab === 'usage' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 border-t border-border/50">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(
                                [
                                    { id: 'ALL', label: `All (${reportData.usageRows.length})` },
                                    {
                                        id: 'USED',
                                        label: `Used (${reportData.usageRows.filter(r => r.totalCheckouts > 0).length})`,
                                    },
                                    {
                                        id: 'UNUSED',
                                        label: `Unused / 0 Checkouts (${reportData.usageRows.filter(r => r.totalCheckouts === 0).length})`,
                                    },
                                    {
                                        id: 'OUT',
                                        label: `Currently Out (${reportData.usageRows.filter(r => r.status === 'CHECKED_OUT').length})`,
                                    },
                                    {
                                        id: 'ISSUE',
                                        label: `Has Issue / Damage (${reportData.usageRows.filter(r => r.hasIssue).length})`,
                                    },
                                ] as Array<{ id: UsageSubsetFilter; label: string }>
                            ).map(pill => (
                                <button
                                    key={pill.id}
                                    type="button"
                                    onClick={() => setUsageSubset(pill.id)}
                                    className={`h-6.5 px-2.5 rounded-md text-[11.5px] font-medium transition-all cursor-pointer ${
                                        usageSubset === pill.id
                                            ? 'bg-primary text-primary-foreground font-semibold'
                                            : 'bg-secondary/70 text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {pill.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground font-medium">
                                Sort by:
                            </span>
                            <select
                                value={usageSort}
                                onChange={e => setUsageSort(e.target.value as UsageSortField)}
                                className="h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="checkouts_desc">Most Used First (Checkouts ↓)</option>
                                <option value="checkouts_asc">Least Used First (Checkouts ↑)</option>
                                <option value="hours_desc">Most Hours / Days Used ↓</option>
                                <option value="last_used_desc">Most Recently Used ↓</option>
                                <option value="name_asc">Item Name (A–Z)</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Summary KPI Cards (shown on report tabs or whenever a specific category like Lens is selected) */}
            {(activeTab !== 'logs' || selectedCategory !== 'ALL') && !isReportLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card className="p-3.5 border border-border shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {categoryDisplayLabel} Pool
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                                {searchQuery.trim() ? `Filter: "${searchQuery.trim()}"` : 'Inventory'}
                            </Badge>
                        </div>
                        <p className="text-2xl font-bold text-foreground mt-1">
                            {reportData.summary.totalItems}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {reportData.summary.availableItems} available
                            </span>
                            {' · '}
                            <span className="text-orange-600 dark:text-orange-400 font-medium">
                                {reportData.summary.checkedOutItems} out
                            </span>
                            {reportData.summary.issueItems > 0 && (
                                <>
                                    {' · '}
                                    <span className="text-destructive font-medium">
                                        {reportData.summary.issueItems} attention
                                    </span>
                                </>
                            )}
                        </p>
                    </Card>

                    <Card className="p-3.5 border border-border shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Total Checkouts &amp; Time
                            </span>
                            <TrendingUp className="w-4 h-4 text-primary" />
                        </div>
                        <p className="text-2xl font-bold text-foreground mt-1">
                            {reportData.summary.totalCheckouts}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                                across {reportData.summary.totalShootsWithCategory} shoots
                            </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Cumulative:{' '}
                            <span className="font-semibold text-foreground">
                                {reportData.summary.totalDaysUsed} {reportData.summary.totalDaysUsed === 1 ? 'day' : 'days'}
                            </span>{' '}
                            ({reportData.summary.totalHoursUsed} hrs)
                        </p>
                    </Card>

                    <Card className="p-3.5 border border-border shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Most Used {selectedCategory === 'ALL' ? 'Item' : selectedCategory}
                            </span>
                            <Badge variant="success" className="text-[10px]">
                                Top #1
                            </Badge>
                        </div>
                        {reportData.summary.mostUsedItem ? (
                            <>
                                <p
                                    className="text-sm font-bold text-foreground mt-1.5 truncate"
                                    title={reportData.summary.mostUsedItem.name}
                                >
                                    {reportData.summary.mostUsedItem.name}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    <span className="font-mono text-foreground">
                                        {reportData.summary.mostUsedItem.barcode}
                                    </span>
                                    {' · '}
                                    <span className="font-semibold text-primary">
                                        {reportData.summary.mostUsedItem.totalCheckouts}×
                                    </span>{' '}
                                    · {formatDurationLabel(reportData.summary.mostUsedItem.totalHoursUsed, reportData.summary.mostUsedItem.totalDaysUsed)}
                                </p>
                            </>
                        ) : (
                            <p className="text-xs text-muted-foreground mt-2">
                                No checkouts recorded in this period.
                            </p>
                        )}
                    </Card>

                    <Card className="p-3.5 border border-border shadow-2xs">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Least / Unused Gear
                            </span>
                            <Badge
                                variant={reportData.summary.neverUsedCount > 0 ? 'warning' : 'secondary'}
                                className="text-[10px]"
                            >
                                {reportData.summary.neverUsedCount} unused
                            </Badge>
                        </div>
                        <p className="text-2xl font-bold text-foreground mt-1">
                            {reportData.summary.neverUsedCount}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                                with 0 checkouts
                            </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                            {reportData.summary.leastUsedActiveItem
                                ? `Lowest active: ${reportData.summary.leastUsedActiveItem.name} (${reportData.summary.leastUsedActiveItem.totalCheckouts}×)`
                                : 'All items have 0 checkouts'}
                        </p>
                    </Card>
                </div>
            )}

            {/* ==================== TAB 1: USAGE & POPULARITY REPORT ==================== */}
            {activeTab === 'usage' && (
                <div className="space-y-3">
                    {isReportLoading ? (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                            Calculating usage &amp; popularity metrics…
                        </div>
                    ) : displayedUsageRows.length === 0 ? (
                        <div className="rounded-xl border-2 border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                            No {categoryDisplayLabel.toLowerCase()} items match these filters.
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <Card className="hidden md:block p-0 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                            <tr>
                                                <th className="px-3.5 py-2.5 font-semibold">Item &amp; Specs</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Barcode / S/N</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Current Status</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Checkouts</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Days / Hours Used</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Last Used</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Top Crew Users</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/70">
                                            {displayedUsageRows.map(row => {
                                                const pct = Math.min(
                                                    100,
                                                    Math.round(
                                                        (row.totalCheckouts / maxCheckoutsInView) * 100
                                                    )
                                                );
                                                return (
                                                    <tr
                                                        key={row.itemId}
                                                        className="hover:bg-muted/35 transition-colors"
                                                    >
                                                        <td className="px-3.5 py-2.5">
                                                            <Link
                                                                href={`/inventory/${encodeURIComponent(row.itemId)}`}
                                                                className="font-semibold text-foreground hover:text-primary"
                                                            >
                                                                {row.name}
                                                            </Link>
                                                            <p className="text-xs text-muted-foreground">
                                                                {[
                                                                    row.category,
                                                                    row.brand !== '—' ? row.brand : null,
                                                                    row.model !== '—' ? row.model : null,
                                                                    row.size !== '—' ? row.size : null,
                                                                ]
                                                                    .filter(Boolean)
                                                                    .join(' · ')}
                                                            </p>
                                                        </td>
                                                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                                                            <span className="font-mono text-xs font-semibold text-foreground block">
                                                                {row.barcode}
                                                            </span>
                                                            {row.serialNumber !== '—' && (
                                                                <span className="font-mono text-[11px] text-muted-foreground">
                                                                    S/N: {row.serialNumber}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3.5 py-2.5">
                                                            <div className="flex flex-wrap items-center gap-1">
                                                                <Badge
                                                                    variant={
                                                                        row.status === 'AVAILABLE'
                                                                            ? 'success'
                                                                            : row.status === 'CHECKED_OUT'
                                                                            ? 'orange'
                                                                            : 'destructive'
                                                                    }
                                                                    className="text-[10.5px]"
                                                                >
                                                                    {row.status.replace(/_/g, ' ')}
                                                                </Badge>
                                                                {row.condition !== 'OK' && (
                                                                    <Badge
                                                                        variant="warning"
                                                                        className="text-[10px]"
                                                                    >
                                                                        {row.conditionLabel}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {row.activeIssueText !== 'None' && (
                                                                <p
                                                                    className="text-[11px] text-destructive mt-0.5 max-w-[200px] truncate"
                                                                    title={row.activeIssueText}
                                                                >
                                                                    {row.activeIssueText}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-3.5 py-2.5 min-w-[130px]">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="font-bold text-foreground">
                                                                    {row.totalCheckouts}
                                                                </span>
                                                                {row.totalCheckouts === 0 ? (
                                                                    <span className="text-[10.5px] text-muted-foreground">
                                                                        Unused
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10.5px] text-muted-foreground">
                                                                        <button type="button" onClick={() => { setSearchQuery(row.barcode !== '—' ? row.barcode : row.name); setActiveTab('shoots'); }} className="text-[10.5px] text-primary hover:underline cursor-pointer font-medium" title="View all shoots for this item">shoots →</button>
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                                                                <div
                                                                    className="h-full bg-primary rounded-full transition-all"
                                                                    style={{ width: `${pct}%` }}
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                                                            <span className="font-medium text-foreground block">
                                                                {row.totalDaysUsed} {row.totalDaysUsed === 1 ? 'day' : 'days'}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground block">
                                                                {row.totalHoursUsed} hrs
                                                            </span>
                                                            <span className="hidden">
                                                                {row.totalDaysUsed} {row.totalDaysUsed === 1 ? 'day' : 'days'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3.5 py-2.5">
                                                            <span className="text-foreground whitespace-nowrap block">
                                                                {row.lastUsedDateLabel}
                                                            </span>
                                                            {row.lastUsedEvent !== '—' && (
                                                                <span
                                                                    className="text-xs text-muted-foreground block max-w-[180px] truncate"
                                                                    title={row.lastUsedEvent}
                                                                >
                                                                    {row.lastUsedEvent}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground max-w-[220px]">
                                                            {row.topCrewLabel}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            {/* Mobile Cards */}
                            <div className="space-y-2 md:hidden">
                                {displayedUsageRows.map(row => (
                                    <Card key={row.itemId} className="p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <Link
                                                    href={`/inventory/${encodeURIComponent(row.itemId)}`}
                                                    className="font-semibold text-sm text-foreground"
                                                >
                                                    {row.name}
                                                </Link>
                                                <p className="text-xs font-mono text-muted-foreground">
                                                    {row.barcode} · {row.category}
                                                </p>
                                            </div>
                                            <Badge
                                                variant={
                                                    row.totalCheckouts > 0 ? 'default' : 'secondary'
                                                }
                                            >
                                                {row.totalCheckouts}× used
                                            </Badge>
                                        </div>
                                        <dl className="grid grid-cols-2 gap-1.5 text-xs pt-1 border-t border-border/50">
                                            <div>
                                                <dt className="text-muted-foreground">Time Used</dt>
                                                <dd className="font-medium text-foreground">
                                                    {row.totalDaysUsed} {row.totalDaysUsed === 1 ? 'day' : 'days'} ({row.totalHoursUsed} hrs)
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-muted-foreground">Last Used</dt>
                                                <dd className="font-medium text-foreground">
                                                    {row.lastUsedDateLabel}
                                                </dd>
                                            </div>
                                            <div className="col-span-2">
                                                <dt className="text-muted-foreground">Top Crew</dt>
                                                <dd className="text-foreground">{row.topCrewLabel}</dd>
                                            </div>
                                        </dl>
                                    </Card>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ==================== TAB 2: SHOOT-BY-SHOOT LOG REPORT ==================== */}
            {activeTab === 'shoots' && (
                <div className="space-y-3">
                    {isReportLoading ? (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                            Loading shoot-by-shoot equipment log…
                        </div>
                    ) : reportData.shootRows.length === 0 ? (
                        <div className="rounded-xl border-2 border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                            No shoots found that checked out {categoryDisplayLabel.toLowerCase()} in this period.
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <Card className="hidden md:block p-0 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                            <tr>
                                                <th className="px-3.5 py-2.5 font-semibold">Event / Shoot</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Date &amp; Duration</th>
                                                <th className="px-3.5 py-2.5 font-semibold">
                                                    {selectedCategory === 'ALL'
                                                        ? 'Equipment Taken'
                                                        : `${selectedCategory}s Taken`}
                                                </th>
                                                <th className="px-3.5 py-2.5 font-semibold">Cameras on Shoot</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Crew / Camera Person</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Return &amp; Condition</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/70">
                                            {reportData.shootRows.map(row => (
                                                <tr
                                                    key={row.transactionId}
                                                    className="hover:bg-muted/35 transition-colors align-top"
                                                >
                                                    <td className="px-3.5 py-2.5">
                                                        <Link
                                                            href={`/transactions/${row.transactionId}`}
                                                            className="font-semibold text-foreground hover:text-primary"
                                                        >
                                                            {row.eventName}
                                                        </Link>
                                                        <p className="text-xs text-muted-foreground">
                                                            {row.location}
                                                        </p>
                                                    </td>
                                                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                                                        <span className="text-foreground block">
                                                            {row.dateOutLabel}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {row.durationLabel}
                                                            {row.dateInLabel !== '—'
                                                                ? ` · In ${row.dateInLabel}`
                                                                : ''}
                                                        </span>
                                                    </td>
                                                    <td className="px-3.5 py-2.5 max-w-[320px]">
                                                        <div className="flex flex-wrap gap-1">
                                                            {row.itemsTaken.map(item => (
                                                                <span
                                                                    key={item.id}
                                                                    className="inline-flex items-center gap-1 text-xs bg-secondary/70 text-foreground px-2 py-0.5 rounded-md border border-border/50"
                                                                >
                                                                    <span>{item.name}</span>
                                                                    {item.barcode && (
                                                                        <span className="font-mono text-[10.5px] text-muted-foreground">
                                                                            ({item.barcode})
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-3.5 py-2.5 text-xs text-muted-foreground max-w-[200px]">
                                                        {row.camerasUsed}
                                                    </td>
                                                    <td className="px-3.5 py-2.5 text-xs text-foreground max-w-[200px]">
                                                        {row.crewLabel}
                                                    </td>
                                                    <td className="px-3.5 py-2.5">
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            {row.outstandingCount > 0 ? (
                                                                <Badge variant="orange">
                                                                    {row.outstandingCount} out
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="success">All back</Badge>
                                                            )}
                                                            {row.hasReturnIssue && (
                                                                <Badge variant="warning">Issue</Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground mt-1">
                                                            {row.returnConditionSummary}
                                                        </p>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            {/* Mobile Cards */}
                            <div className="space-y-2 md:hidden">
                                {reportData.shootRows.map(row => (
                                    <Card key={row.transactionId} className="p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <Link
                                                    href={`/transactions/${row.transactionId}`}
                                                    className="font-semibold text-foreground"
                                                >
                                                    {row.eventName}
                                                </Link>
                                                <p className="text-xs text-muted-foreground">
                                                    {row.location} · {row.dateOutLabel} ({row.durationLabel})
                                                </p>
                                            </div>
                                            {row.outstandingCount > 0 ? (
                                                <Badge variant="orange">{row.outstandingCount} out</Badge>
                                            ) : (
                                                <Badge variant="success">All back</Badge>
                                            )}
                                        </div>
                                        <dl className="space-y-1 text-xs pt-1 border-t border-border/50">
                                            <div className="flex gap-2">
                                                <dt className="w-24 shrink-0 text-muted-foreground">
                                                    {selectedCategory === 'ALL'
                                                        ? 'Items'
                                                        : `${selectedCategory}s`}
                                                </dt>
                                                <dd className="text-foreground">{row.itemsTakenLabel}</dd>
                                            </div>
                                            <div className="flex gap-2">
                                                <dt className="w-24 shrink-0 text-muted-foreground">
                                                    Cameras
                                                </dt>
                                                <dd className="text-foreground">{row.camerasUsed}</dd>
                                            </div>
                                            <div className="flex gap-2">
                                                <dt className="w-24 shrink-0 text-muted-foreground">Crew</dt>
                                                <dd className="text-foreground">{row.crewLabel}</dd>
                                            </div>
                                            <div className="flex gap-2">
                                                <dt className="w-24 shrink-0 text-muted-foreground">
                                                    Condition
                                                </dt>
                                                <dd className="text-foreground">
                                                    {row.returnConditionSummary}
                                                </dd>
                                            </div>
                                        </dl>
                                    </Card>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ==================== TAB 3: CREW USAGE BREAKDOWN REPORT ==================== */}
            {activeTab === 'crew' && (
                <div className="space-y-3">
                    {isReportLoading ? (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                            Calculating crew usage breakdown…
                        </div>
                    ) : reportData.crewRows.length === 0 ? (
                        <div className="rounded-xl border-2 border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                            No crew usage recorded for {categoryDisplayLabel.toLowerCase()} in this period.
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table */}
                            <Card className="hidden md:block p-0 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                            <tr>
                                                <th className="px-3.5 py-2.5 font-semibold">Crew Member</th>
                                                <th className="px-3.5 py-2.5 font-semibold">Shoots / Checkouts</th>
                                                <th className="px-3.5 py-2.5 font-semibold">
                                                    Total &amp; Unique {selectedCategory === 'ALL' ? 'Items' : `${selectedCategory}s`}
                                                </th>
                                                <th className="px-3.5 py-2.5 font-semibold">Days / Hours Used</th>
                                                <th className="px-3.5 py-2.5 font-semibold">
                                                    Most Used {selectedCategory === 'ALL' ? 'Equipment' : `${selectedCategory}s`}
                                                </th>
                                                <th className="px-3.5 py-2.5 font-semibold">Last Checkout</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/70">
                                            {reportData.crewRows.map(row => (
                                                <tr
                                                    key={row.userId}
                                                    className="hover:bg-muted/35 transition-colors align-top"
                                                >
                                                    <td className="px-3.5 py-2.5">
                                                        <span className="font-semibold text-foreground block">
                                                            {row.userName}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {row.userRole}
                                                        </span>
                                                    </td>
                                                    <td className="px-3.5 py-2.5">
                                                        <Badge variant="default">
                                                            {row.checkoutCount} shoots
                                                        </Badge>
                                                    </td>
                                                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                                                        <span className="font-medium text-foreground block">
                                                            {row.totalItemUnitsTaken} total taken
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {row.uniqueItemsUsed} unique
                                                        </span>
                                                    </td>
                                                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                                                        <span className="font-medium text-foreground block">
                                                            {row.totalDaysUsed} {row.totalDaysUsed === 1 ? 'day' : 'days'}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {row.totalHoursUsed} hrs
                                                        </span>
                                                    </td>
                                                    <td className="px-3.5 py-2.5 max-w-[340px]">
                                                        <div className="flex flex-wrap gap-1">
                                                            {row.favoriteItems.map(fav => (
                                                                <span
                                                                    key={fav.id}
                                                                    className="inline-flex items-center gap-1 text-xs bg-secondary/70 text-foreground px-2 py-0.5 rounded-md border border-border/50"
                                                                >
                                                                    <span>{fav.name}</span>
                                                                    {fav.barcode && (
                                                                        <span className="font-mono text-[10px] text-muted-foreground">
                                                                            [{fav.barcode}]
                                                                        </span>
                                                                    )}
                                                                    <span className="font-bold text-primary">
                                                                        {fav.count}×
                                                                    </span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-3.5 py-2.5">
                                                        <span className="text-foreground whitespace-nowrap block">
                                                            {row.lastCheckoutLabel}
                                                        </span>
                                                        <span
                                                            className="text-xs text-muted-foreground block max-w-[180px] truncate"
                                                            title={row.lastEventName}
                                                        >
                                                            {row.lastEventName}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            {/* Mobile Cards */}
                            <div className="space-y-2 md:hidden">
                                {reportData.crewRows.map(row => (
                                    <Card key={row.userId} className="p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-semibold text-foreground">
                                                    {row.userName}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {row.userRole} · {row.uniqueItemsUsed} unique used
                                                </p>
                                            </div>
                                            <Badge variant="default">{row.checkoutCount} shoots</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            <span className="font-semibold text-foreground">
                                                Most used:
                                            </span>{' '}
                                            {row.favoriteItemsLabel}
                                        </p>
                                    </Card>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ==================== TAB 4: ACTIVITY STREAM (AUDIT LOGS) ==================== */}
            {activeTab === 'logs' && (
                <PullToRefresh onRefresh={handleRefresh}>
                    {/* Desktop / Laptop View Table */}
                    <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden shadow-2xs">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border text-[11px] uppercase tracking-wider">
                                    <tr>
                                        <th className="px-3.5 py-2 min-w-[140px]">Date &amp; Time</th>
                                        <th className="px-3.5 py-2 min-w-[120px]">User</th>
                                        <th className="px-3.5 py-2 min-w-[90px]">Action</th>
                                        <th className="px-3.5 py-2 w-full">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {visibleLogs.length === 0 && !loadingLogs ? (
                                        <tr>
                                            <td
                                                colSpan={4}
                                                className="px-4 py-8 text-center text-xs text-muted-foreground"
                                            >
                                                No activity logs found matching these filters
                                            </td>
                                        </tr>
                                    ) : (
                                        visibleLogs.map((log, index) => {
                                            const items = getLogItems(log);
                                            const hasItems = items.length > 0;
                                            const isExpanded = expandedLogIds.has(log.id);
                                            const matchedItems = debouncedSearch.trim()
                                                ? items.filter(item =>
                                                      item
                                                          .toLowerCase()
                                                          .includes(debouncedSearch.toLowerCase().trim())
                                                  )
                                                : [];

                                            return (
                                                <tr
                                                    key={`${log.id}-${index}`}
                                                    className="hover:bg-muted/30 transition-colors align-top"
                                                >
                                                    <td className="px-3.5 py-2.5 whitespace-nowrap text-[11.5px] text-muted-foreground">
                                                        {new Date(log.timestamp).toLocaleString()}
                                                    </td>
                                                    <td className="px-3.5 py-2.5 whitespace-nowrap font-medium text-[12.5px] text-foreground">
                                                        {getUserName(log.userId)}
                                                    </td>
                                                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                                                        <Badge
                                                            variant={logActionVariant(log.action)}
                                                            className="text-[10px] px-2 py-0 rounded-md font-semibold tracking-wide"
                                                        >
                                                            {log.action}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-3.5 py-2.5">
                                                        <div className="space-y-1">
                                                            <p className="text-foreground/90 text-[12px] leading-relaxed font-normal">
                                                                {log.details || '-'}
                                                            </p>

                                                            {matchedItems.length > 0 && !isExpanded && (
                                                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                                                    <span className="text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                                                        Matched:
                                                                    </span>
                                                                    {matchedItems
                                                                        .slice(0, 3)
                                                                        .map((item, i) => (
                                                                            <span
                                                                                key={i}
                                                                                className="inline-flex items-center text-[10.5px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.5 rounded-md"
                                                                            >
                                                                                {item}
                                                                            </span>
                                                                        ))}
                                                                    {matchedItems.length > 3 && (
                                                                        <span className="text-[10px] text-muted-foreground">
                                                                            +{matchedItems.length - 3} more
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {hasItems && (
                                                                <div className="pt-0.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            toggleExpand(log.id)
                                                                        }
                                                                        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-primary hover:text-primary/80 transition-colors"
                                                                    >
                                                                        <svg
                                                                            className={`w-3 h-3 transition-transform ${
                                                                                isExpanded
                                                                                    ? 'rotate-180'
                                                                                    : ''
                                                                            }`}
                                                                            fill="none"
                                                                            viewBox="0 0 24 24"
                                                                            stroke="currentColor"
                                                                        >
                                                                            <path
                                                                                strokeLinecap="round"
                                                                                strokeLinejoin="round"
                                                                                strokeWidth={2}
                                                                                d="M19 9l-7 7-7-7"
                                                                            />
                                                                        </svg>
                                                                        {isExpanded
                                                                            ? 'Hide items'
                                                                            : `View ${items.length} item${
                                                                                  items.length === 1
                                                                                      ? ''
                                                                                      : 's'
                                                                              }`}
                                                                    </button>

                                                                    {isExpanded && (
                                                                        <div className="mt-1.5 flex flex-wrap gap-1 p-2 bg-muted/30 rounded-lg border border-border/50 max-h-48 overflow-y-auto">
                                                                            {items.map((item, i) => {
                                                                                const isMatch =
                                                                                    debouncedSearch.trim() &&
                                                                                    item
                                                                                        .toLowerCase()
                                                                                        .includes(
                                                                                            debouncedSearch
                                                                                                .toLowerCase()
                                                                                                .trim()
                                                                                        );
                                                                                return (
                                                                                    <span
                                                                                        key={i}
                                                                                        className={`text-[10.5px] px-1.5 py-0.5 rounded border ${
                                                                                            isMatch
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
                        {visibleLogs.length === 0 && !loadingLogs ? (
                            <div className="text-center py-8 bg-card rounded-xl border border-border text-xs text-muted-foreground">
                                No activity logs found
                            </div>
                        ) : (
                            visibleLogs.map((log, index) => {
                                const items = getLogItems(log);
                                const hasItems = items.length > 0;
                                const isExpanded = expandedLogIds.has(log.id);
                                const matchedItems = debouncedSearch.trim()
                                    ? items.filter(item =>
                                          item
                                              .toLowerCase()
                                              .includes(debouncedSearch.toLowerCase().trim())
                                      )
                                    : [];

                                return (
                                    <div
                                        key={`${log.id}-${index}`}
                                        className="bg-card p-3 rounded-xl border border-border shadow-2xs space-y-2"
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="space-y-0.5 min-w-0">
                                                <p className="font-semibold text-[13px] text-foreground truncate">
                                                    {getUserName(log.userId)}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </p>
                                            </div>
                                            <Badge
                                                variant={logActionVariant(log.action)}
                                                className="text-[10px] px-1.5 py-0 rounded shrink-0"
                                            >
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
                                                        <span
                                                            key={i}
                                                            className="text-[10.5px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.5 rounded"
                                                        >
                                                            {item}
                                                        </span>
                                                    ))}
                                                    {matchedItems.length > 2 && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            +{matchedItems.length - 2} more
                                                        </span>
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
                                                        <svg
                                                            className={`w-3 h-3 transition-transform ${
                                                                isExpanded ? 'rotate-180' : ''
                                                            }`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M19 9l-7 7-7-7"
                                                            />
                                                        </svg>
                                                        {isExpanded
                                                            ? 'Hide items'
                                                            : `View ${items.length} item${
                                                                  items.length === 1 ? '' : 's'
                                                              }`}
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="mt-1.5 flex flex-wrap gap-1 p-1.5 bg-background/80 dark:bg-background/50 rounded-md border border-border/50 max-h-40 overflow-y-auto">
                                                            {items.map((item, i) => {
                                                                const isMatch =
                                                                    debouncedSearch.trim() &&
                                                                    item
                                                                        .toLowerCase()
                                                                        .includes(
                                                                            debouncedSearch
                                                                                .toLowerCase()
                                                                                .trim()
                                                                        );
                                                                return (
                                                                    <span
                                                                        key={i}
                                                                        className={`text-[10.5px] px-1.5 py-0.5 rounded border ${
                                                                            isMatch
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
                        {loadingLogs ? (
                            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                <div className="animate-spin w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full"></div>
                                Loading logs...
                            </div>
                        ) : hasMore ? (
                            <button
                                type="button"
                                onClick={handleLoadMore}
                                className="h-8 px-4 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-xs font-semibold shadow-2xs active:scale-95 transition-all cursor-pointer"
                            >
                                Load More
                            </button>
                        ) : visibleLogs.length > 0 ? (
                            <p className="text-[11px] text-muted-foreground">No more logs to load</p>
                        ) : null}
                    </div>
                </PullToRefresh>
            )}
        </div>
    );
}
