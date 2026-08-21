'use client';

import { useShoots } from '@/hooks/useShoots';
import { useAssignments } from '@/hooks/useAssignments';
import { useUsers } from '@/hooks/useUsers';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { storage } from '@/lib/storage'; // Still used for type referencing if valid, or remove if unused, but kept for safety. Ideally hooks replace it but types might be needed. Alternatively just imports.
import { Plus, Calendar, MapPin, Clock, Search, Grid3X3, List, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Users, ArrowUpDown, ArrowUp, ArrowDown, Eye, EyeOff, FileText, X, IndianRupee, RefreshCw, CheckCircle2, SlidersHorizontal, GripVertical } from 'lucide-react';
import { format, parseISO, isAfter, isBefore, isToday, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Button } from '@/components/Button';
import { formatWhatsAppMessage, generateShootWhatsAppPayload, generateBulkShootsWhatsAppPayload, openWhatsApp } from '@/lib/whatsapp';
import { WhatsAppDispatchModal } from '@/components/WhatsAppDispatchModal';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useToast } from '@/lib/toast-context';
import { getRoleLabel } from '@/lib/roles';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';
import { jiraBrowseUrl } from '@/lib/config';
import { Shoot, ShootExpense, ShootStatus } from '@/types';
import { getShootTotalExpense, generateShootsCSV, downloadCSV } from '@/lib/finance-utils';
import { JiraIcon } from '@/components/icons/JiraIcon';

type ViewMode = 'card' | 'list';
type StatusFilter = 'ALL' | 'OPEN' | 'WAITING_FOR_REQUESTER' | 'PENDING_PRODUCTION_SETUP' | 'READY_FOR_SHOOT' | 'CONFIRMED' | 'SHOOT_IN_PROGRESS' | 'ON_HOLD' | 'CLOSED' | 'CANCELLED' | 'DRAFT';
type TimeFilter = 'ALL' | 'TODAY' | 'UPCOMING' | 'PAST' | 'CUSTOM';
type SortField = 'title' | 'date' | 'location' | 'crew' | 'status' | 'shootNumber' | 'expenses' | 'jiraTicket' | 'createdAt' | 'poc';
export type ColumnKey = 'shootNumber' | 'title' | 'jiraTicket' | 'date' | 'location' | 'crew' | 'status' | 'actions' | 'poc' | 'createdAt' | 'expenses';

type SortDirection = 'asc' | 'desc';

export const ALL_INDIVIDUAL_STATUSES: StatusFilter[] = [
    'OPEN',
    'WAITING_FOR_REQUESTER',
    'PENDING_PRODUCTION_SETUP',
    'READY_FOR_SHOOT',
    'CONFIRMED',
    'SHOOT_IN_PROGRESS',
    'ON_HOLD',
    'CLOSED',
    'CANCELLED',
    'DRAFT'
];

export const ALL_STATUS_OPTIONS: { value: StatusFilter; label: string; bg: string; text: string; border: string }[] = [
    { value: 'ALL', label: 'All Statuses', bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
    { value: 'OPEN', label: 'Open', bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
    { value: 'WAITING_FOR_REQUESTER', label: 'Waiting for Requester', bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
    { value: 'PENDING_PRODUCTION_SETUP', label: 'Pending Setup', bg: '#ffedd5', text: '#c2410c', border: '#fdba74' },
    { value: 'READY_FOR_SHOOT', label: 'Ready for Shoot', bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
    { value: 'CONFIRMED', label: 'Confirmed', bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
    { value: 'SHOOT_IN_PROGRESS', label: 'In Progress', bg: '#dcfce7', text: '#15803d', border: '#86efac' },
    { value: 'ON_HOLD', label: 'On Hold', bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
    { value: 'CLOSED', label: 'Closed', bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe' },
    { value: 'CANCELLED', label: 'Cancelled', bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
    { value: 'DRAFT', label: 'Draft', bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db' },
];

export default function ShootList() {
    const { user } = useAuth();
    const { department } = useDepartment();
    const labels = getDepartmentLabels(department);

    // React Query Hooks
    const { data: shoots = [], isLoading: shootsLoading, refetch: refetchShoots } = useShoots();
    const { data: assignments = [], isLoading: assignmentsLoading, refetch: refetchAssignments } = useAssignments();
    const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useUsers();

    const loading = shootsLoading || assignmentsLoading || usersLoading;

    // Helper to read initial state synchronously from sessionStorage without flash/glitch
    const getSavedState = () => {
        if (typeof window === 'undefined') return null;
        try {
            const saved = sessionStorage.getItem('shootListState');
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    };

    const getDefaultViewMode = (): ViewMode => {
        const saved = getSavedState()?.viewMode;
        if (saved === 'card' || saved === 'list') return saved;
        if (typeof window !== 'undefined') {
            return window.innerWidth >= 768 ? 'list' : 'card';
        }
        return 'list';
    };

    // Helper functions to safely parse saved multi-filter array or single legacy string
    const parseSavedStatusFilter = (val: any): StatusFilter[] => {
        if (Array.isArray(val)) {
            const valid = val.filter(v => typeof v === 'string') as StatusFilter[];
            return valid.length > 0 ? valid : ['ALL'];
        }
        if (typeof val === 'string' && val) return [val as StatusFilter];
        return ['ALL'];
    };

    const parseSavedCrewFilter = (val: any): string[] => {
        if (Array.isArray(val)) {
            const valid = val.filter(v => typeof v === 'string');
            return valid.length > 0 ? valid : ['ALL'];
        }
        if (typeof val === 'string' && val) return [val];
        return ['ALL'];
    };

    // UI State initialized synchronously
    const [viewMode, setViewMode] = useState<ViewMode>(getDefaultViewMode);
    const [searchQuery, setSearchQuery] = useState<string>(() => getSavedState()?.searchQuery ?? '');
    const [statusFilter, setStatusFilter] = useState<StatusFilter[]>(() => parseSavedStatusFilter(getSavedState()?.statusFilter));
    const [timeFilter, setTimeFilter] = useState<TimeFilter>(() => getSavedState()?.timeFilter || 'ALL');
    const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string }>(() => getSavedState()?.customDateRange || { start: '', end: '' });

    const [crewFilter, setCrewFilter] = useState<string[]>(() => parseSavedCrewFilter(getSavedState()?.crewFilter));
    const [categoryFilter, setCategoryFilter] = useState<string>(() => getSavedState()?.categoryFilter || 'ALL');
    const [expenseFilter, setExpenseFilter] = useState<string>(() => getSavedState()?.expenseFilter || 'ALL');
    const [showFilters, setShowFilters] = useState<boolean>(() => getSavedState()?.showFilters ?? false);
    const [isCrewFilterOpen, setIsCrewFilterOpen] = useState(false);
    const [crewSearchQuery, setCrewSearchQuery] = useState('');
    const crewFilterRef = React.useRef<HTMLDivElement>(null);

    // Sorting state (for list view)
    const [sortField, setSortField] = useState<SortField>(() => getSavedState()?.sortField || 'shootNumber');
    const [sortDirection, setSortDirection] = useState<SortDirection>(() => getSavedState()?.sortDirection || 'desc');

    // Pagination state
    const [pageSize, setPageSize] = useState<number | 'ALL'>(() => getSavedState()?.pageSize ?? 50);
    const [currentPage, setCurrentPage] = useState<number>(() => getSavedState()?.currentPage ?? 1);

    // Persist UI state to sessionStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                sessionStorage.setItem('shootListState', JSON.stringify({
                    viewMode,
                    searchQuery,
                    statusFilter,
                    timeFilter,
                    customDateRange,
                    crewFilter,
                    categoryFilter,
                    expenseFilter,
                    showFilters,
                    sortField,
                    sortDirection,
                    pageSize,
                    currentPage
                }));
            } catch {}
        }
    }, [viewMode, searchQuery, statusFilter, timeFilter, customDateRange, crewFilter, categoryFilter, expenseFilter, showFilters, sortField, sortDirection, pageSize, currentPage]);

    // Default Column Configuration
    const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
        'shootNumber',
        'title',
        'jiraTicket',
        'date',
        'location',
        'crew',
        'status',
        'actions',
        'poc',
        'createdAt',
        'expenses',
    ];

    const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
        shootNumber: 105,
        title: 250,
        jiraTicket: 115,
        date: 190,
        location: 200,
        crew: 120,
        status: 140,
        actions: 95,
        poc: 140,
        createdAt: 115,
        expenses: 115,
    };

    const getDefaultColumnWidths = (customAvailableWidth?: number): Record<ColumnKey, number> => {
        const base: Record<ColumnKey, number> = { ...DEFAULT_COLUMN_WIDTHS };

        if (typeof window !== 'undefined') {
            const screenW = window.innerWidth;
            const isSidebarCollapsed = localStorage.getItem('sidebar_is_collapsed') === 'true' || screenW < 1360;
            const sidebarW = isSidebarCollapsed ? 72 : 260;
            const availableWidth = customAvailableWidth || Math.max(900, screenW - sidebarW - 48);
            const defaultTotal = 105 + 250 + 115 + 190 + 200 + 120 + 140 + 95; // 1215

            if (availableWidth > defaultTotal) {
                const diff = availableWidth - defaultTotal;
                base.title = Math.round(base.title + diff * 0.38);
                base.location = Math.round(base.location + diff * 0.32);
                base.date = Math.round(base.date + diff * 0.30);
            }
        }
        return base;
    };

    // Column Order State
    const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('shoots_column_order');
                if (saved) {
                    const parsed: ColumnKey[] = JSON.parse(saved);
                    const allKeys = [...DEFAULT_COLUMN_ORDER];
                    const filtered = parsed.filter(k => allKeys.includes(k));
                    allKeys.forEach(k => { if (!filtered.includes(k)) filtered.push(k); });
                    return filtered;
                }
            } catch {}
        }
        return DEFAULT_COLUMN_ORDER;
    });

    // Column Visibility State
    const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() => {
        const DEFAULT_VISIBLE: ColumnKey[] = ['shootNumber', 'title', 'jiraTicket', 'date', 'location', 'crew', 'status', 'actions'];
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('shoots_visible_columns_v3');
                if (saved) {
                    const parsed: ColumnKey[] = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length >= 6) return parsed;
                }
            } catch {}
        }
        return DEFAULT_VISIBLE;
    });

    // Bulk Shoot Selection State
    const [selectedShootIds, setSelectedShootIds] = useState<string[]>([]);

    // Flag to know if user has customized column widths manually
    const [hasUserCustomWidths, setHasUserCustomWidths] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return !!localStorage.getItem('shoots_table_col_widths_v7');
        }
        return false;
    });

    // Column Widths State (Excel-Style Resizable with enforced sensible minimums)
    const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('shoots_table_col_widths_v7');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    const merged = { ...getDefaultColumnWidths(), ...parsed };
                    return merged as Record<ColumnKey, number>;
                }
            } catch {}
        }
        return getDefaultColumnWidths();
    });

    // Auto-fit columns to available screen width on resize when user has not manually customized
    useEffect(() => {
        if (hasUserCustomWidths) return;
        const handleResize = () => {
            setColWidths(getDefaultColumnWidths());
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [hasUserCustomWidths]);

    // Crew Column Display Mode ('count' | 'full')
    const [crewDisplayMode, setCrewDisplayMode] = useState<'count' | 'full'>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('shoots_crew_display_mode');
                if (saved === 'count' || saved === 'full') return saved;
            } catch {}
        }
        return 'count';
    });

    const toggleCrewDisplayMode = () => {
        setCrewDisplayMode(prev => {
            const next = prev === 'count' ? 'full' : 'count';
            try {
                localStorage.setItem('shoots_crew_display_mode', next);
            } catch {}
            if (next === 'full') {
                setColWidths(curr => {
                    const currentWidth = curr.crew || DEFAULT_COLUMN_WIDTHS.crew;
                    if (currentWidth < 200) {
                        const updated = { ...curr, crew: 240 };
                        try {
                            localStorage.setItem('shoots_table_col_widths_v7', JSON.stringify(updated));
                        } catch {}
                        return updated;
                    }
                    return curr;
                });
            } else {
                setColWidths(curr => {
                    const updated = { ...curr, crew: DEFAULT_COLUMN_WIDTHS.crew };
                    try {
                        localStorage.setItem('shoots_table_col_widths_v7', JSON.stringify(updated));
                    } catch {}
                    return updated;
                });
            }
            return next;
        });
    };

    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
    const columnMenuRef = React.useRef<HTMLDivElement>(null);
    const headerRef = React.useRef<HTMLDivElement>(null);

    // Column Resizing State
    const [resizingCol, setResizingCol] = useState<ColumnKey | null>(null);
    const resizeStartX = React.useRef(0);
    const resizeStartWidth = React.useRef(0);

    const getColumnStyle = (colKey: ColumnKey): React.CSSProperties => {
        if (hasUserCustomWidths) {
            const width = colWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 100;
            return {
                width: `${width}px`,
                minWidth: `${width}px`,
                maxWidth: `${width}px`,
                flexShrink: 0,
            };
        }

        // Fluid 100% Fit Mode: Harmonious, proportional, generous right columns, zero cut-off
        switch (colKey) {
            case 'shootNumber':
                return { width: '105px', minWidth: '100px', flexShrink: 0 };
            case 'jiraTicket':
                return { width: '115px', minWidth: '105px', flexShrink: 0 };
            case 'crew':
                return crewDisplayMode === 'full'
                    ? { width: '240px', minWidth: '200px', flexShrink: 0 }
                    : { width: '120px', minWidth: '110px', flexShrink: 0 };
            case 'status':
                return { width: '140px', minWidth: '130px', flexShrink: 0 };
            case 'actions':
                return { width: '95px', minWidth: '90px', flexShrink: 0 };
            case 'poc':
                return { width: '140px', minWidth: '125px', flexShrink: 0 };
            case 'createdAt':
                return { width: '115px', minWidth: '105px', flexShrink: 0 };
            case 'expenses':
                return { width: '115px', minWidth: '105px', flexShrink: 0 };
            case 'title':
                return { flex: '1.3 1 220px', minWidth: '180px' };
            case 'location':
                return { flex: '1.0 1 190px', minWidth: '160px' };
            case 'date':
                return { flex: '0.9 1 180px', minWidth: '160px' };
            default:
                return { flex: '1 1 120px', minWidth: '100px' };
        }
    };

    const handleMouseDownResize = (colKey: ColumnKey, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!hasUserCustomWidths && headerRef.current) {
            const cells = headerRef.current.querySelectorAll<HTMLElement>('[data-col-key]');
            const initialWidths: Record<string, number> = {};
            cells.forEach(cell => {
                const key = cell.getAttribute('data-col-key');
                if (key) {
                    initialWidths[key] = Math.round(cell.getBoundingClientRect().width);
                }
            });
            setColWidths(prev => ({ ...prev, ...initialWidths }));
            resizeStartWidth.current = initialWidths[colKey] || colWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 100;
        } else {
            resizeStartWidth.current = colWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 100;
        }

        setResizingCol(colKey);
        setHasUserCustomWidths(true);
        resizeStartX.current = e.clientX;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            const delta = moveEvent.clientX - resizeStartX.current;
            const minW = colKey === 'crew' ? 75 : colKey === 'status' ? 100 : colKey === 'actions' ? 65 : colKey === 'shootNumber' ? 55 : 60;
            const newWidth = Math.max(minW, Math.round(resizeStartWidth.current + delta));
            setColWidths(prev => {
                const updated = { ...prev, [colKey]: newWidth };
                try {
                    localStorage.setItem('shoots_table_col_widths_v7', JSON.stringify(updated));
                } catch {}
                return updated;
            });
        };

        const handleMouseUp = () => {
            setResizingCol(null);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Drag and Drop Column Reordering State
    const [draggedCol, setDraggedCol] = useState<ColumnKey | null>(null);
    const [dragOverCol, setDragOverCol] = useState<ColumnKey | null>(null);

    const handleHeaderDragStart = (colKey: ColumnKey, e: React.DragEvent) => {
        setDraggedCol(colKey);
        e.dataTransfer.setData('text/plain', colKey);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleHeaderDragOver = (colKey: ColumnKey, e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverCol !== colKey) {
            setDragOverCol(colKey);
        }
    };

    const handleHeaderDrop = (targetColKey: ColumnKey, e: React.DragEvent) => {
        e.preventDefault();
        if (!draggedCol || draggedCol === targetColKey) {
            setDraggedCol(null);
            setDragOverCol(null);
            return;
        }

        setColumnOrder(prev => {
            const next = [...prev];
            const sourceIdx = next.indexOf(draggedCol);
            const targetIdx = next.indexOf(targetColKey);
            if (sourceIdx > -1 && targetIdx > -1) {
                next.splice(sourceIdx, 1);
                next.splice(targetIdx, 0, draggedCol);
                try {
                    localStorage.setItem('shoots_column_order', JSON.stringify(next));
                } catch {}
            }
            return next;
        });

        setDraggedCol(null);
        setDragOverCol(null);
    };

    const handleHeaderDragEnd = () => {
        setDraggedCol(null);
        setDragOverCol(null);
    };

    const moveColumn = (colKey: ColumnKey, direction: 'up' | 'down') => {
        setColumnOrder(prev => {
            const next = [...prev];
            const idx = next.indexOf(colKey);
            if (idx === -1) return prev;
            const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (targetIdx < 0 || targetIdx >= next.length) return prev;
            const [removed] = next.splice(idx, 1);
            next.splice(targetIdx, 0, removed);
            try {
                localStorage.setItem('shoots_column_order', JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    const toggleColumn = (colId: ColumnKey) => {
        setVisibleColumns(prev => {
            const next = prev.includes(colId)
                ? (prev.length > 1 ? prev.filter(c => c !== colId) : prev)
                : [...prev, colId];
            try {
                localStorage.setItem('shoots_visible_columns_v3', JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    const handleResetColumns = () => {
        const defaultVisible: ColumnKey[] = ['shootNumber', 'title', 'jiraTicket', 'date', 'location', 'crew', 'status', 'actions'];
        setVisibleColumns(defaultVisible);
        setColumnOrder(DEFAULT_COLUMN_ORDER);
        setHasUserCustomWidths(false);
        setColWidths(getDefaultColumnWidths());
        try {
            localStorage.removeItem('shoots_visible_columns_v3');
            localStorage.removeItem('shoots_visible_columns');
            localStorage.removeItem('shoots_column_order');
            localStorage.removeItem('shoots_table_col_widths_v7');
            localStorage.removeItem('shoots_table_col_widths_v6');
            localStorage.removeItem('shoots_table_col_widths_v5');
            localStorage.removeItem('shoots_table_col_widths');
        } catch {}
    };

    const ALL_COLUMNS: { id: ColumnKey; label: string; defaultVisible: boolean }[] = useMemo(() => [
        { id: 'shootNumber', label: labels.workIdLabel, defaultVisible: true },
        { id: 'title', label: `${labels.workSingular} Name`, defaultVisible: true },
        { id: 'jiraTicket', label: 'Jira Ticket', defaultVisible: true },
        { id: 'date', label: 'Event Schedule', defaultVisible: true },
        { id: 'location', label: 'Location & Venue', defaultVisible: true },
        { id: 'crew', label: labels.teamPlural, defaultVisible: true },
        { id: 'status', label: 'Status', defaultVisible: true },
        { id: 'actions', label: 'Actions / WhatsApp', defaultVisible: true },
        { id: 'poc', label: 'POC & Contact', defaultVisible: false },
        { id: 'createdAt', label: 'Created Date', defaultVisible: false },
        { id: 'expenses', label: 'Expenses', defaultVisible: false },
    ], [labels]);

    // Ordered visible columns based on user columnOrder and visibleColumns
    const orderedVisibleColumns = useMemo(() => {
        return columnOrder.filter(colKey => {
            if (!visibleColumns.includes(colKey)) return false;
            if (colKey === 'expenses' && !['ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(user?.role || '')) {
                return false;
            }
            return true;
        });
    }, [columnOrder, visibleColumns, user?.role]);

    // Close column dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) {
                setIsColumnMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Reset pagination to page 1 on search or filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, timeFilter, customDateRange, crewFilter, categoryFilter, expenseFilter, sortField, sortDirection]);

    // Close crew filter on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (crewFilterRef.current && !crewFilterRef.current.contains(event.target as Node)) {
                setIsCrewFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // WhatsApp Direct Dispatch Confirmation Modal State
    const [dispatchModalState, setDispatchModalState] = useState<{
        isOpen: boolean;
        message: string;
        mentions?: string[];
        targetName?: string;
        departmentId?: string;
    }>({ isOpen: false, message: '' });

    const [flashShootId, setFlashShootId] = useState('');

    // Restore flash highlight & scroll on return
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const flash = sessionStorage.getItem('shootsFlash');
        const savedScroll = sessionStorage.getItem('shootsScroll');
        if (flash) {
            sessionStorage.removeItem('shootsFlash');
            setFlashShootId(flash);
        }
        if (savedScroll) {
            sessionStorage.removeItem('shootsScroll');
            setTimeout(() => {
                const listScroller = document.querySelector('.shoots-list-scroll');
                if (listScroller) {
                    listScroller.scrollTop = Number(savedScroll);
                }
                window.scrollTo({ top: Number(savedScroll), behavior: 'instant' });
            }, 60);
        }
        const onPop = () => {
            const f = sessionStorage.getItem('shootsFlash');
            if (f) {
                sessionStorage.removeItem('shootsFlash');
                setFlashShootId(f);
            }
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    // Clear flash highlight after a moment
    useEffect(() => {
        if (!flashShootId) return;
        const t = setTimeout(() => setFlashShootId(''), 2500);
        return () => clearTimeout(t);
    }, [flashShootId]);

    const handleShootClick = (shootId: string) => {
        if (typeof window !== 'undefined') {
            try {
                const listScroller = document.querySelector('.shoots-list-scroll');
                const scrollY = listScroller ? listScroller.scrollTop : window.scrollY;
                sessionStorage.setItem('shootsScroll', String(scrollY));
                sessionStorage.setItem('shootsFlash', shootId);
            } catch (e) {
                // ignore
            }
        }
    };

    // Save state to session storage on change
    useEffect(() => {
        const state = {
            viewMode,
            searchQuery,
            statusFilter,
            timeFilter,
            customDateRange,
            crewFilter,
            categoryFilter,
            expenseFilter,
            sortField,
            sortDirection,
            showFilters,
            pageSize,
            currentPage
        };
        try {
            sessionStorage.setItem('shootListState', JSON.stringify(state));
        } catch {
            // ignore
        }
    }, [viewMode, searchQuery, statusFilter, timeFilter, customDateRange, crewFilter, categoryFilter, expenseFilter, sortField, sortDirection, showFilters, pageSize, currentPage]);

    // Get crew details (strictly deduplicated by userId)
    const getShootCrew = (shootId: string) => {
        const shootAssignments = assignments.filter(a => a.shootId === shootId);
        const seenUsers = new Set<string>();
        const uniqueCrew: { id: string; name: string; role: string; userId: string }[] = [];

        for (const a of shootAssignments) {
            if (!seenUsers.has(a.userId)) {
                seenUsers.add(a.userId);
                const u = users.find(user => user.id === a.userId);
                uniqueCrew.push({
                    id: a.id,
                    name: u?.name || u?.email || 'Unknown',
                    role: a.role,
                    userId: a.userId
                });
            }
        }
        return uniqueCrew;
    };

    // Get crew count for a shoot (unique users)
    const getCrewCount = (shootId: string) => {
        const shootAssignments = assignments.filter(a => a.shootId === shootId);
        const uniqueUserIds = new Set(shootAssignments.map(a => a.userId));
        return uniqueUserIds.size;
    };

    // Filtered shoots
    const filteredShoots = useMemo(() => {
        if (!user) return [];

        return shoots.filter(shoot => {
            // Role-based access control
            if (user.role === 'CREW') {
                const isAssigned = assignments.some(a => a.shootId === shoot.id && a.userId === user.id);
                if (!isAssigned) return false;
            }

            // Search filter
            const query = searchQuery.toLowerCase();
            const matchesSearch = !query ||
                shoot.title.toLowerCase().includes(query) ||
                shoot.location?.toLowerCase().includes(query) ||
                shoot.description?.toLowerCase().includes(query) ||
                (shoot.shootNumber && shoot.shootNumber.toString().includes(query));

            // Status filter (supports multiple active statuses)
            const isAllStatusesSelected = statusFilter.includes('ALL') || statusFilter.length === ALL_INDIVIDUAL_STATUSES.length;
            const matchesStatus = isAllStatusesSelected ? true : statusFilter.includes(shoot.status as StatusFilter);

            // Time filter
            let matchesTime = true;
            if (timeFilter !== 'ALL' && shoot.startTime) {
                const shootDate = parseISO(shoot.startTime);
                const now = new Date();

                if (timeFilter === 'TODAY') {
                    matchesTime = isToday(shootDate);
                } else if (timeFilter === 'UPCOMING') {
                    matchesTime = isAfter(shootDate, now);
                } else if (timeFilter === 'PAST') {
                    matchesTime = isBefore(shootDate, now) && !isToday(shootDate);
                } else if (timeFilter === 'CUSTOM' && customDateRange.start && customDateRange.end) {
                    const startDate = startOfDay(parseISO(customDateRange.start));
                    const endDate = endOfDay(parseISO(customDateRange.end));
                    matchesTime = isWithinInterval(shootDate, { start: startDate, end: endDate });
                }
            }

            // Crew Filter (supports multi-crew selection & unassigned)
            const isAllCrewSelected = crewFilter.includes('ALL') || (users.length > 0 && crewFilter.length >= users.length);
            let matchesCrew = true;
            if (!isAllCrewSelected) {
                if (crewFilter.length === 0) {
                    matchesCrew = false;
                } else {
                    const hasUnassigned = crewFilter.includes('UNASSIGNED');
                    const userFilterIds = crewFilter.filter(id => id !== 'UNASSIGNED');
                    
                    const shootCrew = assignments.filter(a => a.shootId === shoot.id);
                    const isShootUnassigned = shootCrew.length === 0;
                    
                    const matchesUser = userFilterIds.length > 0 && shootCrew.some(a => userFilterIds.includes(a.userId));
                    const matchesUnassigned = hasUnassigned && isShootUnassigned;
                    
                    matchesCrew = matchesUser || matchesUnassigned;
                }
            }

            // Category Filter
            let matchesCategory = true;
            if (categoryFilter !== 'ALL') {
                const category = shoot.expenses?.find((e: ShootExpense) => e.campaign)?.campaign || 'UNASSIGNED';
                matchesCategory = category === categoryFilter;
            }

            // Expense Filter
            let matchesExpense = true;
            if (expenseFilter !== 'ALL') {
                const totalExp = getShootTotalExpense(shoot);
                if (expenseFilter === 'HAS_EXPENSES') matchesExpense = totalExp > 0;
                else if (expenseFilter === 'NO_EXPENSES') matchesExpense = totalExp === 0;
            }

            return matchesSearch && matchesStatus && matchesTime && matchesCrew && matchesCategory && matchesExpense;
        });
    }, [shoots, searchQuery, statusFilter, timeFilter, crewFilter, categoryFilter, expenseFilter, user, assignments, customDateRange]);

    // Extract unique categories for the filter
    const availableCategories = useMemo(() => {
        const categories = new Set<string>();
        shoots.forEach(shoot => {
            const category = shoot.expenses?.find((e: ShootExpense) => e.campaign)?.campaign;
            if (category) categories.add(category);
        });
        return Array.from(categories).sort();
    }, [shoots]);

    // Sorted shoots for list view
    const sortedShoots = useMemo(() => {
        return [...filteredShoots].sort((a, b) => {
            let comparison = 0;

            switch (sortField) {
                case 'title':
                    comparison = a.title.localeCompare(b.title);
                    break;
                case 'date':
                    if (!a.startTime) return 1;
                    if (!b.startTime) return -1;
                    comparison = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
                    break;
                case 'location':
                    comparison = (a.location || '').localeCompare(b.location || '');
                    break;
                case 'crew':
                    comparison = getCrewCount(a.id) - getCrewCount(b.id);
                    break;
                case 'status':
                    comparison = a.status.localeCompare(b.status);
                    break;
                case 'shootNumber':
                    // Sort by shoot number safely handle nulls
                    comparison = (a.shootNumber || 0) - (b.shootNumber || 0);
                    break;
                case 'expenses':
                    comparison = getShootTotalExpense(a) - getShootTotalExpense(b);
                    break;
                case 'jiraTicket':
                    comparison = (a.jiraTicketId || '').localeCompare(b.jiraTicketId || '');
                    break;
                case 'createdAt':
                    comparison = (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime());
                    break;
                case 'poc':
                    comparison = (a.pocName || '').localeCompare(b.pocName || '');
                    break;
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [filteredShoots, sortField, sortDirection, assignments]);

    // Pagination calculations
    const totalShoots = sortedShoots.length;
    const totalPages = pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(totalShoots / (pageSize as number)));

    // Clamp current page if total pages decrease
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage]);

    const paginatedShoots = useMemo(() => {
        if (pageSize === 'ALL') return sortedShoots;
        const start = (currentPage - 1) * (pageSize as number);
        return sortedShoots.slice(start, start + (pageSize as number));
    }, [sortedShoots, currentPage, pageSize]);

    const fromIndex = totalShoots === 0 ? 0 : pageSize === 'ALL' ? 1 : (currentPage - 1) * (pageSize as number) + 1;
    const toIndex = pageSize === 'ALL' ? totalShoots : Math.min(currentPage * (pageSize as number), totalShoots);

    const handlePageChange = (newPage: number) => {
        const target = Math.max(1, Math.min(newPage, totalPages));
        setCurrentPage(target);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Handle column sort click
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Compact single-line schedule formatter
    const formatScheduleCompact = (startTime?: string | null, endTime?: string | null) => {
        if (!startTime) return { primary: 'TBD', secondary: null };
        try {
            const start = parseISO(startTime);
            if (!endTime) {
                return {
                    primary: format(start, 'MMM d, yyyy'),
                    secondary: format(start, 'h:mm a'),
                };
            }
            const end = parseISO(endTime);
            const isSameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd');
            if (isSameDay) {
                return {
                    primary: format(start, 'MMM d, yyyy'),
                    secondary: `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`,
                };
            }
            const isSameYear = format(start, 'yyyy') === format(end, 'yyyy');
            return {
                primary: isSameYear
                    ? `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
                    : `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`,
                secondary: null,
            };
        } catch {
            return { primary: 'Invalid date', secondary: null };
        }
    };

    // Sort indicator component
    const SortIndicator = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return <ArrowUpDown size={12} className="text-gray-400" />;
        }
        return sortDirection === 'asc'
            ? <ArrowUp size={12} className="text-primary" />
            : <ArrowDown size={12} className="text-primary" />;
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'OPEN':
                return { bg: '#e0f2fe', text: '#0284c7', border: '#bae6fd', label: 'OPEN' }; // Crisp Blue
            case 'WAITING_FOR_REQUESTER':
                return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: 'WAITING FOR REQUESTER' }; // Slate
            case 'PENDING_PRODUCTION_SETUP':
                return { bg: '#ffedd5', text: '#ea580c', border: '#fed7aa', label: 'PENDING SETUP' }; // Warm Amber
            case 'READY_FOR_SHOOT':
                return { bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe', label: 'READY FOR SHOOT' }; // Jira Blue
            case 'CONFIRMED':
                return { bg: '#eff6ff', text: '#1d4ed8', border: '#dbeafe', label: 'CONFIRMED' }; // Royal Blue
            case 'SHOOT_IN_PROGRESS':
                return { bg: '#dcfce7', text: '#16a34a', border: '#bbf7d0', label: 'IN PROGRESS' }; // Green
            case 'ON_HOLD':
                return { bg: '#fef3c7', text: '#d97706', border: '#fde68a', label: 'ON HOLD' }; // Amber
            case 'CLOSED':
                return { bg: '#f3e8ff', text: '#9333ea', border: '#e9d5ff', label: 'CLOSED' }; // Purple
            case 'CANCELLED':
                return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca', label: 'CANCELLED' }; // Red
            case 'DRAFT':
                return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb', label: 'DRAFT' }; // Gray
            default:
                return { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb', label: status };
        }
    };

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { ALL: shoots.length };
        shoots.forEach(s => {
            counts[s.status] = (counts[s.status] || 0) + 1;
        });
        return counts;
    }, [shoots]);

    const isAllStatusesSelected = useMemo(() => {
        return statusFilter.includes('ALL') || statusFilter.length === ALL_INDIVIDUAL_STATUSES.length;
    }, [statusFilter]);

    const isStatusFiltered = useMemo(() => {
        return !isAllStatusesSelected;
    }, [isAllStatusesSelected]);

    const selectAllStatuses = () => setStatusFilter(['ALL']);
    const deselectAllStatuses = () => setStatusFilter([]);

    const toggleStatusFilter = (status: StatusFilter) => {
        if (status === 'ALL') {
            if (isAllStatusesSelected) {
                setStatusFilter([]);
            } else {
                setStatusFilter(['ALL']);
            }
            return;
        }
        setStatusFilter(prev => {
            const isAll = prev.includes('ALL') || prev.length === ALL_INDIVIDUAL_STATUSES.length;
            if (isAll) {
                return ALL_INDIVIDUAL_STATUSES.filter(s => s !== status);
            }
            const exists = prev.includes(status);
            let next: StatusFilter[];
            if (exists) {
                next = prev.filter(s => s !== status);
            } else {
                next = [...prev, status];
            }
            if (next.length === ALL_INDIVIDUAL_STATUSES.length) {
                return ['ALL'];
            }
            return next;
        });
    };

    const isAllCrewSelected = useMemo(() => {
        return crewFilter.includes('ALL') || (users.length > 0 && crewFilter.length >= users.length);
    }, [crewFilter, users]);

    const isCrewFiltered = useMemo(() => {
        return !isAllCrewSelected;
    }, [isAllCrewSelected]);

    const selectAllCrew = () => setCrewFilter(['ALL']);
    const deselectAllCrew = () => setCrewFilter([]);

    const toggleCrewFilter = (crewId: string) => {
        if (crewId === 'ALL') {
            if (isAllCrewSelected) {
                setCrewFilter([]);
            } else {
                setCrewFilter(['ALL']);
            }
            return;
        }
        setCrewFilter(prev => {
            const isAll = prev.includes('ALL');
            if (isAll) {
                const allUserIds = users.map(u => u.id);
                return allUserIds.filter(id => id !== crewId);
            }
            const exists = prev.includes(crewId);
            let next: string[];
            if (exists) {
                next = prev.filter(id => id !== crewId);
            } else {
                next = [...prev, crewId];
            }
            if (users.length > 0 && next.length >= users.length) {
                return ['ALL'];
            }
            return next;
        });
    };

    const [filterAnchor, setFilterAnchor] = useState<{ top: number; left: number; colKey: ColumnKey } | null>(null);
    const headerFilterRef = React.useRef<HTMLDivElement>(null);

    const toggleFilterMenu = (colKey: ColumnKey, e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (filterAnchor?.colKey === colKey) {
            setFilterAnchor(null);
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const popoverWidth = colKey === 'status' ? 280 : colKey === 'crew' ? 280 : 220;
            let left = rect.left;
            if (left + popoverWidth > window.innerWidth - 16) {
                left = window.innerWidth - popoverWidth - 16;
            }
            let top = rect.bottom + 6;
            const estimatedHeight = colKey === 'status' ? 380 : colKey === 'crew' ? 380 : 260;
            if (top + estimatedHeight > window.innerHeight - 16 && rect.top > estimatedHeight) {
                top = Math.max(16, rect.top - estimatedHeight - 6);
            }
            setFilterAnchor({
                top: Math.max(16, top),
                left: Math.max(16, left),
                colKey,
            });
        }
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                headerFilterRef.current &&
                !headerFilterRef.current.contains(e.target as Node) &&
                !(e.target instanceof Element && e.target.closest('[data-filter-trigger]'))
            ) {
                setFilterAnchor(null);
            }
        };
        const handleScrollOrResize = (e: Event) => {
            if (e.type === 'scroll' && e.target instanceof Node && headerFilterRef.current?.contains(e.target)) {
                return;
            }
            if (filterAnchor) setFilterAnchor(null);
        };
        if (filterAnchor) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', handleScrollOrResize, true);
            window.addEventListener('resize', handleScrollOrResize);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
                window.removeEventListener('scroll', handleScrollOrResize, true);
                window.removeEventListener('resize', handleScrollOrResize);
            };
        }
    }, [filterAnchor]);

    const { showToast } = useToast();
    const [isSyncingJira, setIsSyncingJira] = useState(false);

    // Automated silent background Jira sync on mount, on tab focus, and every 3 mins
    useEffect(() => {
        if (!['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '')) return;

        const performSilentSync = () => {
            const lastSync = sessionStorage.getItem('last_auto_jira_sync');
            const now = Date.now();
            // Minimum 60s cooldown between silent syncs to prevent API spam
            if (!lastSync || now - Number(lastSync) > 60000) {
                sessionStorage.setItem('last_auto_jira_sync', String(now));
                fetch('/api/jira/sync', { method: 'POST' })
                    .then(res => res.json())
                    .then(data => {
                        if (data?.newShootsCount > 0 || data?.updatedCount > 0) {
                            handleRefresh();
                        }
                    })
                    .catch(() => {});
            }
        };

        // 1. Run on initial load
        performSilentSync();

        // 2. Run whenever user focuses the browser tab
        const handleWindowFocus = () => {
            performSilentSync();
        };
        window.addEventListener('focus', handleWindowFocus);

        // 3. Periodic 3-minute interval while page is open
        const intervalId = setInterval(performSilentSync, 3 * 60 * 1000);

        return () => {
            window.removeEventListener('focus', handleWindowFocus);
            clearInterval(intervalId);
        };
    }, [user?.role]);

    const handleSyncJira = async () => {
        setIsSyncingJira(true);
        try {
            const res = await fetch('/api/jira/sync', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
                await handleRefresh();
                showToast(data.message || 'Jira tickets synced successfully!', 'success');
            } else {
                showToast(data.error || 'Could not sync Jira tickets', 'warning');
            }
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Error syncing Jira tickets', 'error');
        } finally {
            setIsSyncingJira(false);
        }
    };

    const handleRefresh = async () => {
        await Promise.all([
            refetchShoots(),
            refetchAssignments(),
            refetchUsers()
        ]);
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-12 bg-gray-200 rounded w-full"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-48 bg-gray-200 rounded-2xl"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="flex flex-col h-[calc(100dvh-76px)] sm:h-[calc(100dvh-92px)] w-full overflow-hidden space-y-3 sm:space-y-3.5 animate-fade-in">
                {/* Header (Fixed) */}
                <div className="shrink-0 flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">{labels.workPlural}</h1>
                        <p className="text-xs sm:text-sm mt-0.5 sm:mt-1 text-gray-500 dark:text-gray-400">Manage upcoming {labels.workPluralLower}</p>
                    </div>

                    <div className="flex gap-2">
                        {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const headers = [
                                            labels.workIdLabel, 'Title', 'Start Date', 'Start Time', 'End Date', 'End Time', 'Location', 'POC Name', 'Status', 
                                            `${labels.teamPlural} Count`, `${labels.teamPlural} Names`, 
                                            'Total Expenses', 'Category', 
                                            'Boarding', 'Travel', 'Equipment', 'Manpower', 'Other',
                                            'Description'
                                        ];
                                        const rows = filteredShoots.map(shoot => {
                                            const crew = getShootCrew(shoot.id);
                                            const startDate = shoot.startTime ? format(parseISO(shoot.startTime), 'yyyy-MM-dd') : '';
                                            const startTime = shoot.startTime ? format(parseISO(shoot.startTime), 'HH:mm') : '';
                                            const endDate = shoot.endTime ? format(parseISO(shoot.endTime), 'yyyy-MM-dd') : '';
                                            const endTime = shoot.endTime ? format(parseISO(shoot.endTime), 'HH:mm') : '';
                                            const crewNames = crew.map(c => c.name).join(', ');
                                            const totalExpenses = getShootTotalExpense(shoot);
                                            const category = shoot.expenses?.find((e: ShootExpense) => e.campaign)?.campaign || '';

                                            const getExp = (type: string) => {
                                                const exp = shoot.expenses?.find((e: ShootExpense) => e.type === type);
                                                return exp ? exp.amount : 0;
                                            };

                                            return [
                                                shoot.shootNumber ? `#${shoot.shootNumber}` : '',
                                                `"${shoot.title.replace(/"/g, '""')}"`,
                                                startDate,
                                                startTime,
                                                endDate,
                                                endTime,
                                                `"${(shoot.location || '').replace(/"/g, '""')}"`,
                                                `"${(shoot.pocName || '').replace(/"/g, '""')}"`,
                                                shoot.status,
                                                crew.length,
                                                `"${crewNames}"`,
                                                totalExpenses,
                                                `"${category}"`,
                                                getExp('Boarding'),
                                                getExp('Travel'),
                                                getExp('Equipment'),
                                                getExp('Manpower'),
                                                getExp('Other'),
                                                `"${(shoot.description || '').replace(/"/g, '""')}"`
                                            ].join(',');
                                        });

                                        const csvContent = [headers.join(','), ...rows].join('\n');
                                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                        const url = URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.setAttribute('href', url);
                                        link.setAttribute('download', `${labels.workPluralLower}_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    }}
                                    className="flex gap-2 shadow-sm rounded-xl h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-semibold bg-white dark:bg-[#1c1c1e] text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <FileText size={16} strokeWidth={2.5} />
                                    <span className="hidden sm:inline">Export CSV</span>
                                    <span className="sm:hidden">CSV</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleSyncJira}
                                    disabled={isSyncingJira}
                                    className="flex gap-2 shadow-sm rounded-xl h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-semibold bg-white dark:bg-[#1c1c1e] text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                                    title="Fetch & Auto-Sync Customer Jira Tickets"
                                >
                                    <RefreshCw size={16} strokeWidth={2.5} className={isSyncingJira ? 'animate-spin' : ''} />
                                    <span className="hidden sm:inline">{isSyncingJira ? 'Syncing Jira...' : 'Sync Jira Requests'}</span>
                                    <span className="sm:hidden">Jira</span>
                                </Button>
                            </>
                        )}
                        {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                            <Link href="/shoots/new" className="shrink-0">
                                <Button variant="primary" className="gap-2 shadow-lg rounded-xl h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm font-semibold">
                                    <Plus size={16} strokeWidth={2.5} />
                                    <span className="hidden xs:inline">New {labels.workSingular}</span>
                                    <span className="xs:hidden">New</span>
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>

                {/* Search & Filters Bar (Fixed) */}
                <div className="shrink-0 rounded-2xl p-3 sm:p-4 shadow-xs space-y-3 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800">
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                            {/* Search */}
                            <div className="relative flex-1">
                                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search title, location, ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 sm:pl-12 pr-4 py-2 sm:py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5"
                                        title="Clear search"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                        {/* View Toggle & Filter Button */}
                        <div className="flex gap-2">
                            {/* View Mode Toggle */}
                            <div className="flex rounded-lg p-1 shrink-0 bg-gray-100 dark:bg-gray-800">
                                <button
                                    onClick={() => setViewMode('card')}
                                    className={`p-1.5 sm:p-2 rounded-md transition-all ${viewMode === 'card'
                                        ? 'bg-white dark:bg-[#1c1c1e] shadow text-gray-900 dark:text-white'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                    title="Grid / Card View"
                                >
                                    <Grid3X3 size={18} />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 sm:p-2 rounded-md transition-all ${viewMode === 'list'
                                        ? 'bg-white dark:bg-[#1c1c1e] shadow text-gray-900 dark:text-white'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                    title="Table / List View"
                                >
                                    <List size={18} />
                                </button>
                            </div>

                            {/* Filter Toggle Button with Active Count Badge */}
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                                    showFilters || (isStatusFiltered || timeFilter !== 'ALL' || isCrewFiltered || categoryFilter !== 'ALL' || expenseFilter !== 'ALL')
                                        ? 'bg-primary/10 text-primary border border-primary/25 font-semibold'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent'
                                }`}
                                title={
                                    (isStatusFiltered || timeFilter !== 'ALL' || isCrewFiltered || categoryFilter !== 'ALL' || expenseFilter !== 'ALL')
                                        ? 'Active filters applied. Click to toggle panel'
                                        : 'Filter shoots'
                                }
                            >
                                <Filter size={15} />
                                <span className="hidden sm:inline">Filters</span>
                                {(isStatusFiltered || timeFilter !== 'ALL' || isCrewFiltered || categoryFilter !== 'ALL' || expenseFilter !== 'ALL') && (
                                    <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full">
                                        {[
                                            isStatusFiltered,
                                            timeFilter !== 'ALL',
                                            isCrewFiltered,
                                            categoryFilter !== 'ALL',
                                            expenseFilter !== 'ALL'
                                        ].filter(Boolean).length}
                                    </span>
                                )}
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Columns Customizer (for List View) */}
                            <div className="relative" ref={columnMenuRef}>
                                <button
                                    onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                                    className={`flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${isColumnMenuOpen
                                        ? 'bg-primary/10 text-primary border border-primary/20'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent'
                                        }`}
                                    title="Add or Remove Columns"
                                >
                                    <SlidersHorizontal size={15} />
                                    <span className="hidden sm:inline">Columns</span>
                                    <ChevronDown size={14} className={`transition-transform ${isColumnMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isColumnMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-72 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1e] shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
                                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 dark:border-gray-800">
                                            <div>
                                                <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider block">Columns</span>
                                                <span className="text-[10px] text-gray-400">Toggle & reorder positions</span>
                                            </div>
                                            <button
                                                onClick={handleResetColumns}
                                                className="text-[11px] text-primary hover:underline font-semibold"
                                            >
                                                Reset
                                            </button>
                                        </div>
                                        <div className="space-y-1 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
                                            {columnOrder.map((colKey, index) => {
                                                const colDef = ALL_COLUMNS.find(c => c.id === colKey);
                                                if (!colDef) return null;
                                                if (colKey === 'expenses' && !['ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(user?.role || '')) {
                                                    return null;
                                                }
                                                const isChecked = visibleColumns.includes(colKey);
                                                return (
                                                    <div
                                                        key={colKey}
                                                        className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors select-none ${
                                                            isChecked ? 'bg-gray-50 dark:bg-gray-800/60' : 'opacity-60 hover:opacity-90'
                                                        }`}
                                                    >
                                                        <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0 pr-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => toggleColumn(colKey)}
                                                                className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer shrink-0"
                                                            />
                                                            <span className={`font-medium truncate ${isChecked ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                {colDef.label}
                                                            </span>
                                                        </label>
                                                        {/* Reorder Buttons */}
                                                        <div className="flex items-center gap-0.5 shrink-0">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    moveColumn(colKey, 'up');
                                                                }}
                                                                disabled={index === 0}
                                                                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                                                                title="Move column left / up"
                                                            >
                                                                <ChevronUp size={13} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    moveColumn(colKey, 'down');
                                                                }}
                                                                disabled={index === columnOrder.length - 1}
                                                                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                                                                title="Move column right / down"
                                                            >
                                                                <ChevronDown size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Crew View Mode Switcher */}
                                        <div className="pt-2.5 mt-1 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                            <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{labels.teamPlural} View</span>
                                            <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (crewDisplayMode !== 'count') toggleCrewDisplayMode();
                                                    }}
                                                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                                                        crewDisplayMode === 'count'
                                                            ? 'bg-white dark:bg-[#2c2c2e] text-gray-900 dark:text-white shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                                                    }`}
                                                >
                                                    Count
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (crewDisplayMode !== 'full') toggleCrewDisplayMode();
                                                    }}
                                                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                                                        crewDisplayMode === 'full'
                                                            ? 'bg-white dark:bg-[#2c2c2e] text-gray-900 dark:text-white shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                                                    }`}
                                                >
                                                    Full Names
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ALWAYS-VISIBLE ACTIVE FILTER CHIPS (Visible even when filter panel is closed) */}
                    {(isStatusFiltered || timeFilter !== 'ALL' || isCrewFiltered || categoryFilter !== 'ALL' || expenseFilter !== 'ALL' || searchQuery.trim()) && (
                        <div className="flex flex-wrap items-center gap-1.5 px-0.5 animate-in fade-in duration-200">
                            <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 flex items-center gap-1 mr-0.5">
                                <Filter size={11} className="text-primary" />
                                Active:
                            </span>

                            {searchQuery.trim() && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 shadow-2xs">
                                    <span className="text-gray-400">Search:</span> &ldquo;{searchQuery}&rdquo;
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="hover:text-red-500 ml-0.5 cursor-pointer"
                                        title="Clear search query"
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            )}

                            {isStatusFiltered && statusFilter.map(st => {
                                const opt = ALL_STATUS_OPTIONS.find(o => o.value === st);
                                return (
                                    <span key={st} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary border border-primary/25 shadow-2xs">
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: opt?.text || '#2563eb' }} />
                                        <span>{opt?.label || st.replace(/_/g, ' ')}</span>
                                        <button
                                            onClick={() => toggleStatusFilter(st)}
                                            className="hover:text-red-500 ml-0.5 cursor-pointer"
                                            title={`Remove ${opt?.label || st} filter`}
                                        >
                                            <X size={11} />
                                        </button>
                                    </span>
                                );
                            })}

                            {timeFilter !== 'ALL' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary border border-primary/25 shadow-2xs">
                                    <span className="opacity-70 font-normal">When:</span> {timeFilter === 'CUSTOM' ? `${customDateRange.start} → ${customDateRange.end}` : timeFilter}
                                    <button
                                        onClick={() => {
                                            setTimeFilter('ALL');
                                            setCustomDateRange({ start: '', end: '' });
                                        }}
                                        className="hover:text-red-500 ml-0.5 cursor-pointer"
                                        title="Remove time filter"
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            )}

                            {isCrewFiltered && crewFilter.map(cId => {
                                const name = cId === 'UNASSIGNED' ? 'Unassigned (0 Crew)' : (users.find(u => u.id === cId)?.name || 'Crew Member');
                                return (
                                    <span key={cId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs">
                                        <span className="opacity-70 font-normal">Crew:</span> {name}
                                        <button
                                            onClick={() => toggleCrewFilter(cId)}
                                            className="hover:text-red-500 ml-0.5 cursor-pointer"
                                            title={`Remove ${name} filter`}
                                        >
                                            <X size={11} />
                                        </button>
                                    </span>
                                );
                            })}

                            {categoryFilter !== 'ALL' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary border border-primary/25 shadow-2xs">
                                    <span className="opacity-70 font-normal">Category:</span> {categoryFilter}
                                    <button
                                        onClick={() => setCategoryFilter('ALL')}
                                        className="hover:text-red-500 ml-0.5 cursor-pointer"
                                        title="Remove category filter"
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            )}

                            {expenseFilter !== 'ALL' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary border border-primary/25 shadow-2xs">
                                    <span className="opacity-70 font-normal">Expenses:</span> {expenseFilter === 'HAS_EXPENSES' ? 'With Expenses' : 'No Expenses'}
                                    <button
                                        onClick={() => setExpenseFilter('ALL')}
                                        className="hover:text-red-500 ml-0.5 cursor-pointer"
                                        title="Remove expense filter"
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            )}

                            <button
                                onClick={() => {
                                    setStatusFilter(['ALL']);
                                    setTimeFilter('ALL');
                                    setCrewFilter(['ALL']);
                                    setCategoryFilter('ALL');
                                    setExpenseFilter('ALL');
                                    setCustomDateRange({ start: '', end: '' });
                                    setSearchQuery('');
                                }}
                                className="text-[11px] font-bold text-red-500 hover:text-red-600 hover:underline px-1.5 py-0.5 cursor-pointer transition-colors ml-1"
                                title="Reset all filters"
                            >
                                Reset all
                            </button>
                        </div>
                    )}

                    {/* COMPACT 1-LINE FILTER TOOLBAR (When Expanded) */}
                    {showFilters && (
                        <div className="flex flex-wrap items-center gap-2.5 p-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/70 animate-in fade-in slide-in-from-top-1 duration-150">
                            {/* 1. Status Multi-Filter Trigger */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Status:</span>
                                <button
                                    type="button"
                                    data-filter-trigger="status"
                                    onClick={(e) => toggleFilterMenu('status', e)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 ${
                                        isStatusFiltered
                                            ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <span className="truncate max-w-[140px]">
                                        {!isStatusFiltered
                                            ? 'All Statuses'
                                            : statusFilter.length === 1
                                            ? (ALL_STATUS_OPTIONS.find(o => o.value === statusFilter[0])?.label || statusFilter[0])
                                            : `${statusFilter.length} Statuses`}
                                    </span>
                                    <ChevronDown size={12} className="text-gray-400 shrink-0" />
                                </button>
                            </div>

                            {/* 2. When / Time Filter */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">When:</span>
                                <select
                                    value={timeFilter}
                                    onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer shadow-2xs focus:ring-1 focus:ring-primary ${
                                        timeFilter !== 'ALL'
                                            ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <option value="ALL">All Dates</option>
                                    <option value="TODAY">Today</option>
                                    <option value="UPCOMING">Upcoming</option>
                                    <option value="PAST">Past</option>
                                    <option value="CUSTOM">Custom Range...</option>
                                </select>

                                {timeFilter === 'CUSTOM' && (
                                    <div className="flex items-center gap-1 animate-in fade-in duration-150">
                                        <input
                                            type="date"
                                            value={customDateRange.start}
                                            onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                                            className="px-2 py-0.5 text-xs rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xs"
                                        />
                                        <span className="text-gray-400 text-xs">-</span>
                                        <input
                                            type="date"
                                            value={customDateRange.end}
                                            onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                                            className="px-2 py-0.5 text-xs rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xs"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* 3. Assigned Crew (Admin Only) Multi-Filter Trigger */}
                            {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Assigned:</span>
                                    <button
                                        type="button"
                                        data-filter-trigger="crew"
                                        onClick={(e) => toggleFilterMenu('crew', e)}
                                        className={`flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-lg border text-xs transition-all cursor-pointer shadow-2xs ${
                                            isCrewFiltered
                                                ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                        }`}
                                    >
                                        <span className="truncate max-w-[130px]">
                                            {!isCrewFiltered
                                                ? `All ${labels.teamPlural}`
                                                : crewFilter.length === 1
                                                ? (crewFilter[0] === 'UNASSIGNED' ? 'Unassigned' : users.find(u => u.id === crewFilter[0])?.name || '1 Member')
                                                : `${crewFilter.length} ${labels.teamPlural}`}
                                        </span>
                                        <ChevronDown size={12} className="text-gray-400 shrink-0" />
                                    </button>
                                </div>
                            )}

                            {/* 4. Category Filter */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Category:</span>
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer shadow-2xs focus:ring-1 focus:ring-primary ${
                                        categoryFilter !== 'ALL'
                                            ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <option value="ALL">All Categories</option>
                                    {availableCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                    <option value="UNASSIGNED">Unassigned</option>
                                </select>
                            </div>

                            {/* 5. Expenses Filter (Admin / Finance only) */}
                            {['ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(user?.role || '') && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Expenses:</span>
                                    <select
                                        value={expenseFilter}
                                        onChange={(e) => setExpenseFilter(e.target.value)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer shadow-2xs focus:ring-1 focus:ring-primary ${
                                            expenseFilter !== 'ALL'
                                                ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                        }`}
                                    >
                                        <option value="ALL">All Expenses</option>
                                        <option value="HAS_EXPENSES">With Expenses</option>
                                        <option value="NO_EXPENSES">No Expenses</option>
                                    </select>
                                </div>
                            )}

                            {/* Sort Controls (in expanded filters) */}
                            <div className="flex items-center gap-1.5 sm:ml-auto">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Sort:</span>
                                <select
                                    value={sortField}
                                    onChange={(e) => setSortField(e.target.value as SortField)}
                                    className="px-2 py-1 rounded-lg text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-300 focus:ring-1 focus:ring-primary cursor-pointer shadow-2xs"
                                >
                                    <option value="date">Date</option>
                                    <option value="shootNumber">{labels.workIdLabel}</option>
                                    <option value="title">{labels.workSingular} Name</option>
                                    <option value="status">Status</option>
                                    <option value="expenses">Expenses</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    className="p-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1 text-xs cursor-pointer shadow-2xs"
                                    title={`Sorting ${sortDirection === 'asc' ? 'Ascending' : 'Descending'}. Click to toggle`}
                                >
                                    {sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                                    <span>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Results Count (Fixed) */}
                <div className="shrink-0 flex items-center justify-between px-1">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        {totalShoots === 0 ? (
                            `0 ${labels.workPluralLower}`
                        ) : (
                            <>
                                Showing <span className="font-semibold text-gray-900 dark:text-white">{fromIndex}–{toIndex}</span> of <span className="font-semibold text-gray-900 dark:text-white">{totalShoots}</span> {labels.workPluralLower}
                                {totalShoots !== shoots.length && (
                                    <span className="text-xs text-gray-400 ml-1"> (filtered from {shoots.length})</span>
                                )}
                            </>
                        )}
                    </p>
                    {totalShoots > 0 && pageSize !== 'ALL' && totalPages > 1 && (
                        <p className="text-xs text-gray-400">
                            Page {currentPage} of {totalPages}
                        </p>
                    )}
                </div>

                {/* Shoots Grid/List Content (Internal Scrolling Pane) */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {filteredShoots.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 rounded-2xl shadow-sm bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-gray-100 dark:bg-gray-800">
                                <Calendar size={28} className="text-gray-400 dark:text-gray-500" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                                {searchQuery || isStatusFiltered || timeFilter !== 'ALL' || isCrewFiltered ? `No ${labels.workPluralLower} found` : `No ${labels.workPluralLower} yet`}
                            </h3>
                            <p className="max-w-sm mx-auto mb-4 text-gray-500 dark:text-gray-400">
                                {searchQuery || isStatusFiltered || timeFilter !== 'ALL' || isCrewFiltered
                                    ? 'Try adjusting your search or filters'
                                    : `Create your first ${labels.workLower} to start tracking work`}
                            </p>
                            {!(searchQuery || isStatusFiltered || timeFilter !== 'ALL' || isCrewFiltered) && ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
                                <Link href="/shoots/new">
                                    <Button size="sm">Create {labels.workSingular}</Button>
                                </Link>
                            )}
                        </div>
                    ) : viewMode === 'card' ? (
                        /* Card View (Internal Scroll) */
                        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-5 p-1 pr-2 scrollbar-thin">
                        {paginatedShoots.map(shoot => {
                            const statusStyle = getStatusStyle(shoot.status);
                            const crewCount = getCrewCount(shoot.id);

                            return (
                                <div
                                    key={shoot.id}
                                    className="group h-full"
                                >
                                    <div className={`relative flex h-full flex-col rounded-2xl border bg-card p-4 shadow-sm transition-all duration-700 hover:shadow-md sm:p-5 ${
                                        shoot.id === flashShootId
                                            ? 'border-primary bg-primary/[0.08] dark:bg-primary/[0.14] ring-2 ring-primary/40 shadow-md scale-[1.01]'
                                            : 'border-border hover:border-primary/40'
                                    }`}>
                                        
                                        {/* Header: Badges & Status */}
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {shoot.shootNumber && (
                                                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md tracking-wider">
                                                        #{shoot.shootNumber}
                                                    </span>
                                                )}
                                                {shoot.jiraTicketId && (
                                                    <a
                                                        href={jiraBrowseUrl(shoot.jiraTicketId)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/40 text-[#0052CC] dark:text-[#4c9aff] border border-blue-200/60 dark:border-blue-800/40 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/40"
                                                        title={`Open ${shoot.jiraTicketId} in Jira ServiceDesk`}
                                                    >
                                                        <JiraIcon size={12} className="shrink-0" />
                                                        {shoot.jiraTicketId}
                                                    </a>
                                                )}
                                                {/* Category Badge */}
                                                {shoot.expenses?.find((e: ShootExpense) => e.campaign)?.campaign && (
                                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-md uppercase tracking-wider">
                                                        {shoot.expenses.find((e: ShootExpense) => e.campaign)!.campaign}
                                                    </span>
                                                )}
                                                {shoot.googleEventId && (
                                                    <div className="flex items-center justify-center h-5 w-5 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700" title="Synced with Google Calendar">
                                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>
                                            <span
                                                style={{ backgroundColor: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}` }}
                                                className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider shrink-0"
                                            >
                                                {shoot.status}
                                            </span>
                                        </div>

                                        {/* Title & Description */}
                                        <div className="mb-4">
                                            <h3 className="mb-1 text-lg font-bold leading-snug text-foreground transition-colors line-clamp-1">
                                                <Link
                                                    href={`/shoots/${shoot.id}`}
                                                    onClick={() => handleShootClick(shoot.id)}
                                                    className="transition-colors hover:text-primary"
                                                    title={`Open ${shoot.title}`}
                                                >
                                                    {shoot.title}
                                                </Link>
                                            </h3>
                                            {shoot.description && (
                                                <p className="text-sm line-clamp-2 text-gray-500 dark:text-gray-400 leading-relaxed">
                                                    {shoot.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Info Box (Date, Time, Location) */}
                                        <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/60 rounded-xl p-3 space-y-2.5 mb-4 mt-auto">
                                            <div className="flex items-start gap-2.5 text-gray-600 dark:text-gray-300">
                                                <Calendar size={15} className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                                        {shoot.startTime ? (
                                                            shoot.endTime && format(parseISO(shoot.startTime), 'yyyy-MM-dd') !== format(parseISO(shoot.endTime), 'yyyy-MM-dd')
                                                                ? `${format(parseISO(shoot.startTime), 'MMM d')} - ${format(parseISO(shoot.endTime), 'MMM d, yyyy')}`
                                                                : format(parseISO(shoot.startTime), 'EEE, MMM d, yyyy')
                                                        ) : 'Date not set'}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                        {shoot.startTime ? format(parseISO(shoot.startTime), 'h:mm a') : 'TBD'}
                                                        {shoot.endTime && ` - ${format(parseISO(shoot.endTime), 'h:mm a')}`}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2.5 text-gray-600 dark:text-gray-300">
                                                <MapPin size={15} className="shrink-0 text-gray-400 dark:text-gray-500" />
                                                <span className="text-sm font-medium truncate text-gray-800 dark:text-gray-200">
                                                    {shoot.location || 'Location not set'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Footer */}
                                        <div className="flex items-center justify-between pt-1">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-1.5 relative cursor-pointer group/crew hover:z-30">
                                                    <Users size={15} className="text-gray-400 dark:text-gray-500" />
                                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                        {crewCount}
                                                    </span>
                                                    
                                                    {/* Hover Tooltip for Team Members */}
                                                    {crewCount > 0 && (
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-lg border border-border bg-popover p-3 shadow-xl ring-1 ring-black/5 dark:ring-white/10 opacity-0 invisible group-hover/crew:opacity-100 group-hover/crew:visible transition-all z-50 pointer-events-none">
                                                            <p className="text-xs font-bold text-gray-900 dark:text-white mb-2 border-b border-border pb-1">Assigned {labels.teamPlural}</p>
                                                            <div className="space-y-1.5">
                                                                {getShootCrew(shoot.id).map((member, idx) => (
                                                                    <div key={idx} className="flex justify-between items-center text-xs">
                                                                        <span className="text-gray-500 dark:text-gray-400">{getRoleLabel(member.role)}</span>
                                                                        <span className="font-medium text-gray-900 dark:text-white truncate max-w-[120px] text-right" title={member.name}>{member.name}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                {['ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(user?.role || '') && getShootTotalExpense(shoot) > 0 && (
                                                    <div className="flex items-center gap-1.5 relative cursor-pointer group/expense hover:z-30" title="Total Expenses">
                                                        <IndianRupee size={15} className="text-gray-400 dark:text-gray-500" />
                                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                            {getShootTotalExpense(shoot).toLocaleString('en-IN')}
                                                        </span>
                                                        
                                                        {/* Hover Tooltip for Expense Breakdown */}
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-lg border border-border bg-popover p-3 shadow-xl ring-1 ring-black/5 dark:ring-white/10 opacity-0 invisible group-hover/expense:opacity-100 group-hover/expense:visible transition-all z-50 pointer-events-none">
                                                            <p className="text-xs font-bold text-gray-900 dark:text-white mb-2 border-b border-border pb-1">Expense Breakdown</p>
                                                            <div className="space-y-1.5">
                                                                {shoot.expenses?.filter(e => Number(e.amount) > 0).map((expense, idx) => (
                                                                    <div key={idx} className="flex justify-between items-center text-xs">
                                                                        <span className="text-gray-500 dark:text-gray-400 capitalize">{expense.type.toLowerCase()}</span>
                                                                        <span className="font-medium text-gray-900 dark:text-white">₹{Number(expense.amount).toLocaleString('en-IN')}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div className="mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-xs font-bold">
                                                                <span className="text-gray-900 dark:text-white">Total</span>
                                                                <span className="text-gray-900 dark:text-white">₹{getShootTotalExpense(shoot).toLocaleString('en-IN')}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex items-center gap-0.5">
                                                {/* Creator Initial Avatar */}
                                                <div 
                                                    className="h-6 w-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-400 mr-2 border border-gray-200 dark:border-gray-700"
                                                    title={`Created by ${users.find(u => u.id === shoot.createdBy)?.name || shoot.createdBy || 'Admin'}`}
                                                >
                                                    {(users.find(u => u.id === shoot.createdBy)?.name || shoot.createdBy || 'A').charAt(0).toUpperCase()}
                                                </div>
                                                
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const { message, mentions } = generateShootWhatsAppPayload(
                                                            shoot,
                                                            assignments.filter(a => a.shootId === shoot.id),
                                                            users,
                                                            labels
                                                        );
                                                        setDispatchModalState({
                                                            isOpen: true,
                                                            message,
                                                            mentions,
                                                            targetName: 'Configured WhatsApp Group',
                                                            departmentId: shoot.departmentId
                                                        });
                                                    }}
                                                    className="p-1.5 rounded-md text-gray-400 hover:text-[#25D366] hover:bg-[#25D366]/10 transition-colors relative z-10"
                                                    title="Share on WhatsApp"
                                                >
                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                                    </svg>
                                                </button>

                                                <button
                                                    onClick={async (e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const text = formatWhatsAppMessage(
                                                            shoot,
                                                            assignments.filter(a => a.shootId === shoot.id),
                                                            users,
                                                            labels
                                                        );

                                                        const showToast = () => {
                                                            const toast = document.createElement('div');
                                                            toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm font-medium z-50 animate-in fade-in slide-in-from-bottom-2';
                                                            toast.textContent = 'Copied to clipboard';
                                                            document.body.appendChild(toast);
                                                            setTimeout(() => toast.remove(), 2000);
                                                        };

                                                        // Robust Copy Logic
                                                        if (navigator.clipboard && window.isSecureContext) {
                                                            try {
                                                                await navigator.clipboard.writeText(text);
                                                                showToast();
                                                            } catch (err) {
                                                                console.error('Clipboard API failed', err);
                                                                fallbackCopy(text);
                                                            }
                                                        } else {
                                                            fallbackCopy(text);
                                                        }

                                                        function fallbackCopy(text: string) {
                                                            const textArea = document.createElement("textarea");
                                                            textArea.value = text;

                                                            // Ensure it's not visible but part of DOM
                                                            textArea.style.position = "fixed";
                                                            textArea.style.left = "-9999px";
                                                            textArea.style.top = "0";
                                                            document.body.appendChild(textArea);

                                                            textArea.focus();
                                                            textArea.select();

                                                            try {
                                                                document.execCommand('copy');
                                                                showToast();
                                                            } catch (err) {
                                                                console.error('Fallback copy failed', err);
                                                                alert('Failed to copy to clipboard');
                                                            }

                                                            document.body.removeChild(textArea);
                                                        }
                                                    }}
                                                    className="p-1.5 rounded-md text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors relative z-10"
                                                    title="Copy to Clipboard"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* List View (Unified Single Scroll Container with Sticky Header, Resizable & Reorderable Columns) */
                    <div className="rounded-2xl shadow-xs bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-800 flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="w-full min-w-full">
                                {/* Table Header (Sticky with Drag to Reorder & Resize) */}
                                <div ref={headerRef} className="sticky top-0 z-20 bg-gray-50/95 dark:bg-[#1f1f23]/95 backdrop-blur-xs border-b border-gray-200 dark:border-gray-800 flex items-center w-full min-w-full text-[11px] font-semibold text-gray-500 dark:text-gray-400 select-none uppercase tracking-wider shadow-2xs">
                                {orderedVisibleColumns.map((colKey, colIdx) => {
                                    const isLast = colIdx === orderedVisibleColumns.length - 1;
                                    const isDragOver = dragOverCol === colKey;
                                    const isDragging = draggedCol === colKey;

                                    return (
                                        <div
                                            key={colKey}
                                            data-col-key={colKey}
                                            style={getColumnStyle(colKey)}
                                            draggable={!resizingCol}
                                            onDragStart={(e) => handleHeaderDragStart(colKey, e)}
                                            onDragOver={(e) => handleHeaderDragOver(colKey, e)}
                                            onDrop={(e) => handleHeaderDrop(colKey, e)}
                                            onDragEnd={handleHeaderDragEnd}
                                            className={`relative flex items-center px-2.5 py-2.5 group/header cursor-grab active:cursor-grabbing transition-colors ${
                                                !isLast ? 'border-r border-gray-200 dark:border-gray-800' : ''
                                            } ${isDragOver ? 'bg-primary/20 ring-2 ring-primary ring-inset' : ''} ${
                                                isDragging ? 'opacity-30' : ''
                                            }`}
                                            title="Drag column header left/right to reorder"
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                <GripVertical size={11} className="text-gray-400 dark:text-gray-500 opacity-0 group-hover/header:opacity-100 transition-opacity shrink-0 cursor-grab" />
                                                
                                                {colKey === 'shootNumber' && (
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={paginatedShoots.length > 0 && paginatedShoots.every(s => selectedShootIds.includes(s.id))}
                                                            onChange={() => {
                                                                const allSelected = paginatedShoots.length > 0 && paginatedShoots.every(s => selectedShootIds.includes(s.id));
                                                                if (allSelected) {
                                                                    const pageIds = new Set(paginatedShoots.map(s => s.id));
                                                                    setSelectedShootIds(prev => prev.filter(id => !pageIds.has(id)));
                                                                } else {
                                                                    const pageIds = paginatedShoots.map(s => s.id);
                                                                    setSelectedShootIds(prev => Array.from(new Set([...prev, ...pageIds])));
                                                                }
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="w-3.5 h-3.5 rounded text-primary focus:ring-primary border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer shrink-0"
                                                            title={paginatedShoots.length > 0 && paginatedShoots.every(s => selectedShootIds.includes(s.id)) ? 'Deselect all on this page' : 'Select all on this page'}
                                                        />
                                                        <button
                                                            onClick={() => handleSort('shootNumber')}
                                                            className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'shootNumber' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                            title={`Sort by ${labels.workIdLabel || 'ID'}`}
                                                        >
                                                            {labels.workIdLabel || 'ID'} <SortIndicator field="shootNumber" />
                                                        </button>
                                                    </div>
                                                )}

                                                {colKey === 'title' && (
                                                    <div className="flex items-center justify-between w-full min-w-0 pr-0.5">
                                                        <button
                                                            onClick={() => handleSort('title')}
                                                            className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'title' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                            title={`Sort by ${labels.workSingular} Name`}
                                                        >
                                                            {labels.workSingular} <SortIndicator field="title" />
                                                        </button>
                                                    </div>
                                                )}

                                                {colKey === 'jiraTicket' && (
                                                    <button
                                                        onClick={() => handleSort('jiraTicket')}
                                                        className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'jiraTicket' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                    >
                                                        Jira <SortIndicator field="jiraTicket" />
                                                    </button>
                                                )}

                                                {colKey === 'date' && (
                                                    <div className="flex items-center justify-between w-full min-w-0 pr-0.5">
                                                        <button
                                                            onClick={() => handleSort('date')}
                                                            className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'date' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                            title="Sort chronologically by Event Schedule"
                                                        >
                                                            Schedule <SortIndicator field="date" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            data-filter-trigger="date"
                                                            onClick={(e) => toggleFilterMenu('date', e)}
                                                            className={`p-1 rounded transition-all shrink-0 ${
                                                                timeFilter !== 'ALL'
                                                                    ? 'bg-primary text-white shadow-xs'
                                                                    : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700'
                                                            }`}
                                                            title={`Filter by Event Timing (${timeFilter})`}
                                                        >
                                                            <Filter size={11} className={timeFilter !== 'ALL' ? 'fill-current' : ''} />
                                                        </button>
                                                    </div>
                                                )}

                                                {colKey === 'location' && (
                                                    <button
                                                        onClick={() => handleSort('location')}
                                                        className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'location' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                    >
                                                        Location <SortIndicator field="location" />
                                                    </button>
                                                )}

                                                {colKey === 'crew' && (
                                                    <div className="flex items-center justify-between w-full min-w-0 pr-0.5">
                                                        <button
                                                            onClick={() => handleSort('crew')}
                                                            className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'crew' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                        >
                                                            {labels.teamPlural} <SortIndicator field="crew" />
                                                        </button>
                                                        <div className="flex items-center gap-0.5 shrink-0">
                                                            <button
                                                                type="button"
                                                                data-filter-trigger="crew"
                                                                onClick={(e) => toggleFilterMenu('crew', e)}
                                                                className={`p-1 rounded transition-all shrink-0 flex items-center gap-0.5 ${
                                                                    isCrewFiltered
                                                                        ? 'bg-primary text-white shadow-xs px-1.5'
                                                                        : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700'
                                                                }`}
                                                                title={`Filter by Crew (${isCrewFiltered ? `${crewFilter.length} selected` : 'All'})`}
                                                            >
                                                                <Filter size={11} className={isCrewFiltered ? 'fill-current' : ''} />
                                                                {isCrewFiltered && (
                                                                    <span className="text-[10px] font-bold leading-none">{crewFilter.length}</span>
                                                                )}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleCrewDisplayMode();
                                                                }}
                                                                className={`ml-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight transition-all shrink-0 border ${
                                                                    crewDisplayMode === 'full'
                                                                        ? 'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25'
                                                                        : 'bg-gray-200/80 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-transparent hover:text-gray-900 dark:hover:text-white'
                                                                }`}
                                                                title={crewDisplayMode === 'full' ? 'Currently showing full names. Click to switch to count' : 'Currently showing count. Click to switch to full names'}
                                                            >
                                                                {crewDisplayMode === 'full' ? 'Names' : 'Count'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {colKey === 'poc' && (
                                                    <button
                                                        onClick={() => handleSort('poc')}
                                                        className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'poc' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                    >
                                                        POC <SortIndicator field="poc" />
                                                    </button>
                                                )}

                                                {colKey === 'createdAt' && (
                                                    <button
                                                        onClick={() => handleSort('createdAt')}
                                                        className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'createdAt' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                    >
                                                        Created <SortIndicator field="createdAt" />
                                                    </button>
                                                )}

                                                {colKey === 'expenses' && (
                                                    <button
                                                        onClick={() => handleSort('expenses')}
                                                        className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'expenses' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                    >
                                                        Expenses <SortIndicator field="expenses" />
                                                    </button>
                                                )}

                                                {colKey === 'status' && (
                                                    <div className="flex items-center justify-between w-full min-w-0 pr-0.5">
                                                        <button
                                                            onClick={() => handleSort('status')}
                                                            className={`flex items-center gap-1 font-bold transition-colors text-left truncate ${sortField === 'status' ? 'text-primary' : 'hover:text-gray-900 dark:hover:text-white'}`}
                                                            title="Sort alphabetically by Status"
                                                        >
                                                            Status <SortIndicator field="status" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            data-filter-trigger="status"
                                                            onClick={(e) => toggleFilterMenu('status', e)}
                                                            className={`p-1 rounded transition-all shrink-0 flex items-center gap-0.5 ${
                                                                isStatusFiltered
                                                                    ? 'bg-primary text-white shadow-xs px-1.5'
                                                                    : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700'
                                                            }`}
                                                            title={`Filter by Status (${isStatusFiltered ? `${statusFilter.length} selected` : 'All'})`}
                                                        >
                                                            <Filter size={11} className={isStatusFiltered ? 'fill-current' : ''} />
                                                            {isStatusFiltered && (
                                                                <span className="text-[10px] font-bold leading-none">{statusFilter.length}</span>
                                                            )}
                                                        </button>
                                                    </div>
                                                )}

                                                {colKey === 'actions' && (
                                                    <div className="flex items-center justify-center w-full min-w-0">
                                                        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                                            Actions
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Clean Full-Height Column Resizer Handle */}
                                            <div
                                                onMouseDown={(e) => handleMouseDownResize(colKey, e)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize select-none flex items-center justify-center group/resizer z-30 touch-none"
                                                title="Drag to resize column width"
                                            >
                                                <div className={`w-[2px] h-full transition-colors ${
                                                    resizingCol === colKey ? 'bg-primary' : 'bg-transparent group-hover/resizer:bg-primary/70'
                                                }`} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Table Rows */}
                            <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
                                {paginatedShoots.map((shoot, index) => {
                                    const statusStyle = getStatusStyle(shoot.status);
                                    const crewCount = getCrewCount(shoot.id);
                                    const isSelected = selectedShootIds.includes(shoot.id);

                                    return (
                                        <div key={shoot.id} className="group w-full min-w-full">
                                    <div
                                        className={`flex items-center w-full min-w-full transition-colors hover:bg-blue-50/30 dark:hover:bg-blue-950/20 ${
                                            isSelected
                                                ? 'bg-primary/[0.06] dark:bg-primary/[0.12]'
                                                : index % 2 === 1 ? 'bg-gray-50/40 dark:bg-white/[0.01]' : 'bg-white dark:bg-transparent'
                                        } ${
                                            shoot.id === flashShootId
                                                ? 'bg-primary/[0.1] dark:bg-primary/[0.18] ring-2 ring-inset ring-primary/40'
                                                : ''
                                        }`}
                                    >
                                        {orderedVisibleColumns.map((colKey, colIdx) => {
                                            const isLast = colIdx === orderedVisibleColumns.length - 1;

                                            return (
                                                <div
                                                    key={colKey}
                                                    style={getColumnStyle(colKey)}
                                                    className={`px-2.5 py-2 flex items-center min-h-[38px] min-w-0 ${
                                                        !isLast ? 'border-r border-gray-100 dark:border-gray-800/60' : ''
                                                    }`}
                                                >
                                                    {/* 1. Shoot # & Checkbox */}
                                                    {colKey === 'shootNumber' && (
                                                        <div className="flex items-center gap-2 shrink-0 min-w-0">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => {
                                                                    setSelectedShootIds(prev =>
                                                                        prev.includes(shoot.id)
                                                                            ? prev.filter(id => id !== shoot.id)
                                                                            : [...prev, shoot.id]
                                                                    );
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-3.5 h-3.5 rounded text-primary focus:ring-primary border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer shrink-0"
                                                                title={isSelected ? 'Deselect shoot' : 'Select shoot'}
                                                            />
                                                            {shoot.shootNumber ? (
                                                                <span className="text-xs font-mono font-medium text-gray-500 dark:text-gray-400">
                                                                    #{shoot.shootNumber}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-gray-300 dark:text-gray-600">-</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* 2. Shoot Title */}
                                                    {colKey === 'title' && (
                                                        <div className="flex items-center gap-1.5 min-w-0 w-full">
                                                            <Link
                                                                href={`/shoots/${shoot.id}`}
                                                                onClick={() => handleShootClick(shoot.id)}
                                                                className="font-medium text-xs text-gray-900 dark:text-gray-100 hover:text-primary transition-colors truncate"
                                                                title={`${shoot.title}${shoot.description ? `\n\nNotes: ${shoot.description}` : ''}`}
                                                            >
                                                                {shoot.title}
                                                            </Link>
                                                            {shoot.description && (
                                                                <span
                                                                    className="w-1.5 h-1.5 rounded-full bg-blue-400/80 shrink-0 cursor-help"
                                                                    title={`Notes: ${shoot.description}`}
                                                                />
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* 3. Jira */}
                                                    {colKey === 'jiraTicket' && (
                                                        shoot.jiraTicketId ? (
                                                            <a
                                                                href={jiraBrowseUrl(shoot.jiraTicketId)}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#0052CC] dark:text-[#4c9aff] hover:underline transition-colors whitespace-nowrap"
                                                                onClick={(e) => e.stopPropagation()}
                                                                title={`Open ${shoot.jiraTicketId} in Jira ServiceDesk`}
                                                            >
                                                                <JiraIcon size={12} className="shrink-0 text-[#0052CC] dark:text-[#4c9aff]" />
                                                                <span>{shoot.jiraTicketId}</span>
                                                            </a>
                                                        ) : (
                                                            <span className="text-xs text-gray-300 dark:text-gray-600">-</span>
                                                        )
                                                    )}

                                                    {/* 4. Event Schedule (Single-line Compact) */}
                                                    {colKey === 'date' && (
                                                        shoot.startTime ? (
                                                            (() => {
                                                                const schedule = formatScheduleCompact(shoot.startTime, shoot.endTime);
                                                                return (
                                                                    <div
                                                                        className="flex items-center gap-1.5 min-w-0 text-xs truncate"
                                                                        title={
                                                                            shoot.endTime
                                                                                ? `${format(parseISO(shoot.startTime), 'MMM d, yyyy, h:mm a')} → ${format(parseISO(shoot.endTime), 'MMM d, yyyy, h:mm a')}`
                                                                                : format(parseISO(shoot.startTime), 'MMM d, yyyy, h:mm a')
                                                                        }
                                                                    >
                                                                        <span className="font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                                                                            {schedule.primary}
                                                                        </span>
                                                                        {schedule.secondary && (
                                                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                                                • {schedule.secondary}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()
                                                        ) : (
                                                            <span className="text-xs text-gray-400 dark:text-gray-500">TBD</span>
                                                        )
                                                    )}

                                                    {/* 5. Location */}
                                                    {colKey === 'location' && (
                                                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate block w-full" title={shoot.location || 'TBD'}>
                                                            {shoot.location || <span className="text-gray-400 dark:text-gray-500">TBD</span>}
                                                        </span>
                                                    )}

                                                    {/* 6. Crew */}
                                                    {colKey === 'crew' && (
                                                        crewDisplayMode === 'full' ? (
                                                            <div className="flex items-center gap-1 min-w-0 w-full truncate">
                                                                {getShootCrew(shoot.id).length > 0 ? (
                                                                    getShootCrew(shoot.id).map((member, idx) => (
                                                                        <span
                                                                            key={idx}
                                                                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 whitespace-nowrap"
                                                                            title={`${getRoleLabel(member.role)}: ${member.name}`}
                                                                        >
                                                                            {member.name}
                                                                        </span>
                                                                    ))
                                                                ) : (
                                                                    <span className="text-xs text-gray-300 dark:text-gray-600">-</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="relative group/crew flex items-center">
                                                                <div className="cursor-pointer w-fit">
                                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-primary transition-colors">
                                                                        <Users size={12} className="text-gray-400 shrink-0" />
                                                                        <span>{crewCount}</span>
                                                                    </span>
                                                                </div>

                                                                {crewCount > 0 && (
                                                                    <div className={`absolute ${index < 3 ? 'top-full pt-1' : 'bottom-full pb-1'} left-0 w-52 opacity-0 invisible group-hover/crew:opacity-100 group-hover/crew:visible transition-all duration-150 z-50 pointer-events-auto`}>
                                                                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1e] p-3 shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
                                                                            <p className="text-xs font-bold text-gray-900 dark:text-white mb-2 border-b border-gray-100 dark:border-gray-800 pb-1 flex items-center justify-between">
                                                                                <span>Assigned Crew</span>
                                                                                <span className="text-[10px] font-bold text-primary">{crewCount} members</span>
                                                                            </p>
                                                                            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                                                                                {getShootCrew(shoot.id).map((member, idx) => (
                                                                                     <div key={idx} className="flex justify-between items-center text-xs py-0.5 border-b border-gray-50 dark:border-gray-800/40 last:border-0">
                                                                                        <span className="text-gray-500 dark:text-gray-400 text-[11px] shrink-0 pr-2">{getRoleLabel(member.role)}</span>
                                                                                        <span className="font-semibold text-gray-900 dark:text-white truncate text-right" title={member.name}>{member.name}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    )}

                                                    {/* 7. POC */}
                                                    {colKey === 'poc' && (
                                                        shoot.pocName ? (
                                                            <span className="text-xs text-gray-800 dark:text-gray-200 truncate block w-full" title={`${shoot.pocName}${shoot.pocContact ? ` (${shoot.pocContact})` : ''}`}>
                                                                {shoot.pocName}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-300 dark:text-gray-600">-</span>
                                                        )
                                                    )}

                                                    {/* 8. Created Date */}
                                                    {colKey === 'createdAt' && (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate whitespace-nowrap">
                                                            {shoot.createdAt ? format(parseISO(shoot.createdAt), 'MMM d, yyyy') : '-'}
                                                        </span>
                                                    )}

                                                    {/* 9. Expenses (Admin) */}
                                                    {colKey === 'expenses' && (
                                                        getShootTotalExpense(shoot) > 0 ? (
                                                            <div className="relative group/expense flex items-center">
                                                                <span className="text-xs font-mono font-medium text-gray-800 dark:text-gray-200 cursor-pointer">
                                                                    ₹{getShootTotalExpense(shoot).toLocaleString('en-IN')}
                                                                </span>

                                                                <div className={`absolute ${index < 3 ? 'top-full pt-1' : 'bottom-full pb-1'} left-0 w-60 opacity-0 invisible group-hover/expense:opacity-100 group-hover/expense:visible transition-all duration-150 z-50 pointer-events-auto`}>
                                                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1c1c1e] p-3 shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
                                                                        <p className="text-xs font-bold text-gray-900 dark:text-white mb-2 border-b border-gray-100 dark:border-gray-800 pb-1">Expense Breakdown</p>
                                                                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                                                                            {shoot.expenses?.filter(e => Number(e.amount) > 0).map((expense, idx) => (
                                                                                <div key={idx} className="flex justify-between items-center text-xs py-0.5">
                                                                                    <span className="text-gray-500 dark:text-gray-400 capitalize">{expense.type.toLowerCase()}</span>
                                                                                    <span className="font-semibold text-gray-900 dark:text-white">₹{Number(expense.amount).toLocaleString('en-IN')}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <div className="mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-xs font-bold">
                                                                            <span className="text-gray-900 dark:text-white">Total</span>
                                                                            <span className="text-gray-900 dark:text-white">₹{getShootTotalExpense(shoot).toLocaleString('en-IN')}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-300 dark:text-gray-600">-</span>
                                                        )
                                                    )}

                                                    {/* 10. Status */}
                                                    {colKey === 'status' && (
                                                        <span
                                                            style={{
                                                                backgroundColor: statusStyle.bg,
                                                                color: statusStyle.text,
                                                                border: `1px solid ${statusStyle.border}`,
                                                            }}
                                                            className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 inline-flex items-center justify-center whitespace-nowrap"
                                                        >
                                                            {statusStyle.label || shoot.status.replace(/_/g, ' ')}
                                                        </span>
                                                    )}

                                                    {/* 11. Actions & WhatsApp */}
                                                    {colKey === 'actions' && (
                                                        <div className="flex items-center justify-center gap-2 w-full shrink-0">
                                                            {/* WhatsApp Dispatch Button */}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    const shootAssignments = assignments.filter(a => a.shootId === shoot.id);
                                                                    if (shootAssignments.length === 0) {
                                                                        showToast('Please add crew before sending WhatsApp call sheet', 'error');
                                                                        return;
                                                                    }
                                                                    const { message, mentions } = generateShootWhatsAppPayload(
                                                                        shoot,
                                                                        shootAssignments,
                                                                        users,
                                                                        labels
                                                                    );
                                                                    setDispatchModalState({
                                                                        isOpen: true,
                                                                        message,
                                                                        mentions,
                                                                        targetName: 'Configured WhatsApp Group',
                                                                        departmentId: shoot.departmentId
                                                                    });
                                                                }}
                                                                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                                    crewCount === 0
                                                                        ? 'text-gray-300 dark:text-gray-600 hover:text-amber-500 hover:bg-amber-500/10'
                                                                        : 'text-gray-500 dark:text-gray-400 hover:text-[#25D366] hover:bg-[#25D366]/15 hover:scale-110 active:scale-95'
                                                                }`}
                                                                title={crewCount === 0 ? 'Please add crew first' : 'Send WhatsApp Call Sheet to Group'}
                                                            >
                                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="shrink-0">
                                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                                                </svg>
                                                            </button>

                                                            {/* Copy Call Sheet Button */}
                                                            <button
                                                                type="button"
                                                                onClick={async (e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    const shootAssignments = assignments.filter(a => a.shootId === shoot.id);
                                                                    if (shootAssignments.length === 0) {
                                                                        showToast('Please add crew before copying WhatsApp message', 'error');
                                                                        return;
                                                                    }
                                                                    const text = formatWhatsAppMessage(
                                                                        shoot,
                                                                        shootAssignments,
                                                                        users,
                                                                        labels
                                                                    );
                                                                    if (navigator.clipboard && window.isSecureContext) {
                                                                        try {
                                                                            await navigator.clipboard.writeText(text);
                                                                            showToast('WhatsApp message copied to clipboard!', 'success');
                                                                        } catch {
                                                                            showToast('Copied to clipboard', 'info');
                                                                        }
                                                                    } else {
                                                                        showToast('Copied to clipboard', 'info');
                                                                    }
                                                                }}
                                                                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                                    crewCount === 0
                                                                        ? 'text-gray-300 dark:text-gray-600 hover:text-amber-500 hover:bg-amber-500/10'
                                                                        : 'text-gray-500 dark:text-gray-400 hover:text-primary hover:bg-primary/15 hover:scale-110 active:scale-95'
                                                                }`}
                                                                title={crewCount === 0 ? 'Please add crew first' : 'Copy WhatsApp Message to Clipboard'}
                                                            >
                                                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
                )}
            </div>

                {/* Modern Pagination Controls (Fixed Footer) */}
                {totalShoots > 0 && (
                    <div className="shrink-0">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2.5 sm:p-3 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                            {/* Left: Row Count Details */}
                            <div className="flex items-center gap-2">
                                <span>
                                    Showing <strong className="font-semibold text-gray-900 dark:text-white">{fromIndex}</strong> to <strong className="font-semibold text-gray-900 dark:text-white">{toIndex}</strong> of <strong className="font-semibold text-gray-900 dark:text-white">{totalShoots}</strong> {labels.workPluralLower}
                                </span>
                            </div>

                            {/* Center: Navigation Buttons */}
                            {pageSize !== 'ALL' && totalPages > 1 && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handlePageChange(1)}
                                        disabled={currentPage === 1}
                                        aria-label="First page"
                                        title="First page"
                                        className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                    >
                                        <ChevronsLeft size={15} />
                                    </button>
                                    <button
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        aria-label="Previous page"
                                        title="Previous page"
                                        className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                    >
                                        <ChevronLeft size={15} />
                                    </button>

                                    {/* Page numbers */}
                                    <div className="flex items-center gap-1 mx-1">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                                            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                            .map((p, idx, arr) => {
                                                const prevP = arr[idx - 1];
                                                const showEllipsis = prevP && p - prevP > 1;
                                                return (
                                                    <React.Fragment key={p}>
                                                        {showEllipsis && <span className="px-1 text-gray-400">…</span>}
                                                        <button
                                                            onClick={() => handlePageChange(p)}
                                                            className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                                                currentPage === p
                                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                                    : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                                            }`}
                                                        >
                                                            {p}
                                                        </button>
                                                    </React.Fragment>
                                                );
                                            })}
                                    </div>

                                    <button
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        aria-label="Next page"
                                        title="Next page"
                                        className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                    >
                                        <ChevronRight size={15} />
                                    </button>
                                    <button
                                        onClick={() => handlePageChange(totalPages)}
                                        disabled={currentPage === totalPages}
                                        aria-label="Last page"
                                        title="Last page"
                                        className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                    >
                                        <ChevronsRight size={15} />
                                    </button>
                                </div>
                            )}

                            {/* Right: Page Size Selector */}
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 dark:text-gray-400">Rows per page:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => {
                                        const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                                        setPageSize(val);
                                        setCurrentPage(1);
                                    }}
                                    className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium focus:ring-1 focus:ring-primary cursor-pointer shadow-xs"
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value="ALL">All ({totalShoots})</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Bulk WhatsApp & Actions Bar */}
            {selectedShootIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
                    <div className="flex items-center gap-2.5 bg-gray-900/95 dark:bg-[#222226]/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-white/10 ring-1 ring-black/20">
                        <div className="flex items-center gap-2 pr-2.5 border-r border-white/15">
                            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-bold whitespace-nowrap">
                                {selectedShootIds.length} {selectedShootIds.length === 1 ? labels.workSingular : labels.workPlural} selected
                            </span>
                        </div>

                        {/* Send Bulk WhatsApp */}
                        <button
                            type="button"
                            onClick={() => {
                                const selectedShoots = shoots.filter(s => selectedShootIds.includes(s.id));
                                const payload = generateBulkShootsWhatsAppPayload(selectedShoots, assignments, users, labels);
                                setDispatchModalState({
                                    isOpen: true,
                                    message: payload.message,
                                    mentions: payload.mentions,
                                    targetName: 'Configured WhatsApp Group',
                                    departmentId: selectedShoots[0]?.departmentId
                                });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#22bf5b] text-white text-xs font-bold transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
                        >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                            </svg>
                            <span>Send WhatsApp</span>
                        </button>

                        {/* Copy Bulk Summary */}
                        <button
                            type="button"
                            onClick={async () => {
                                const selectedShoots = shoots.filter(s => selectedShootIds.includes(s.id));
                                const payload = generateBulkShootsWhatsAppPayload(selectedShoots, assignments, users, labels);
                                if (navigator.clipboard && window.isSecureContext) {
                                    try {
                                        await navigator.clipboard.writeText(payload.message);
                                        showToast(`Copied WhatsApp schedule for ${selectedShoots.length} shoots!`, 'success');
                                    } catch {
                                        showToast('Copied schedule to clipboard', 'info');
                                    }
                                } else {
                                    showToast('Copied schedule to clipboard', 'info');
                                }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Copy combined WhatsApp summary to clipboard"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Copy Summary</span>
                        </button>

                        {/* Clear Selection */}
                        <button
                            type="button"
                            onClick={() => setSelectedShootIds([])}
                            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors ml-1 cursor-pointer"
                            title="Clear selection"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Floating In-Header Column Filter Dropdown (Rendered in Portal to avoid any clipping) */}
            {filterAnchor && typeof document !== 'undefined' && createPortal(
                <div
                    ref={headerFilterRef}
                    style={{
                        position: 'fixed',
                        top: `${filterAnchor.top}px`,
                        left: `${filterAnchor.left}px`,
                        zIndex: 99999,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-72 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-2.5 text-xs font-normal normal-case animate-in fade-in zoom-in-95 duration-100 ring-1 ring-black/10 dark:ring-white/10 select-none"
                >
                    {filterAnchor.colKey === 'status' && (
                        <div className="flex flex-col max-h-[380px]">
                            {/* Header */}
                            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 dark:border-gray-800 mb-1 shrink-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-gray-900 dark:text-white text-xs">Filter by Status</span>
                                    {isStatusFiltered && (
                                        <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                                            {statusFilter.length}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {isAllStatusesSelected ? (
                                        <button
                                            type="button"
                                            onClick={deselectAllStatuses}
                                            className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                                        >
                                            Deselect All
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={selectAllStatuses}
                                                className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                                            >
                                                Select All
                                            </button>
                                            {statusFilter.length > 0 && (
                                                <>
                                                    <span className="text-gray-300 dark:text-gray-700">•</span>
                                                    <button
                                                        type="button"
                                                        onClick={deselectAllStatuses}
                                                        className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer"
                                                    >
                                                        Clear
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Status List */}
                            <div className="space-y-0.5 overflow-y-auto pr-1 scrollbar-thin flex-1 min-h-0">
                                {ALL_STATUS_OPTIONS.map((opt) => {
                                    const count = statusCounts[opt.value] || 0;
                                    const isAllOption = opt.value === 'ALL';
                                    const isChecked = isAllOption
                                        ? isAllStatusesSelected
                                        : isAllStatusesSelected || statusFilter.includes(opt.value);

                                    return (
                                        <div
                                            key={opt.value}
                                            onClick={() => toggleStatusFilter(opt.value)}
                                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer select-none ${
                                                isChecked
                                                    ? isAllOption
                                                        ? 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white font-bold'
                                                        : 'bg-primary/10 text-primary font-bold'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {}}
                                                    className="w-3.5 h-3.5 rounded text-primary focus:ring-primary/40 cursor-pointer accent-primary pointer-events-none"
                                                />
                                                {!isAllOption && (
                                                    <span
                                                        className="w-2 h-2 rounded-full shrink-0"
                                                        style={{ backgroundColor: opt.text }}
                                                    />
                                                )}
                                                <span className="truncate text-xs">{opt.label}</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 ml-2">
                                                {count}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Footer */}
                            <div className="pt-2 mt-1.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 shrink-0">
                                <span className="text-[10px] text-gray-400">
                                    {isAllStatusesSelected ? 'All statuses selected' : `${statusFilter.length} status${statusFilter.length === 1 ? '' : 'es'} selected`}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setFilterAnchor(null)}
                                    className="px-3 py-1 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 cursor-pointer shadow-2xs"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    )}

                    {filterAnchor.colKey === 'date' && (
                        <>
                            <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-100 dark:border-gray-800 mb-1">
                                <span className="font-bold text-gray-900 dark:text-white">Filter Schedule</span>
                                {timeFilter !== 'ALL' && (
                                    <button
                                        onClick={() => {
                                            setTimeFilter('ALL');
                                            setFilterAnchor(null);
                                        }}
                                        className="text-[11px] font-semibold text-primary hover:underline"
                                    >
                                        Reset Filter
                                    </button>
                                )}
                            </div>

                            <div className="space-y-0.5">
                                {[
                                    { value: 'ALL' as TimeFilter, label: 'All Dates' },
                                    { value: 'TODAY' as TimeFilter, label: 'Today Only' },
                                    { value: 'UPCOMING' as TimeFilter, label: 'Upcoming Shoots' },
                                    { value: 'PAST' as TimeFilter, label: 'Past Shoots' },
                                ].map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => {
                                            setTimeFilter(opt.value);
                                            setFilterAnchor(null);
                                        }}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                                            timeFilter === opt.value
                                                ? 'bg-primary/10 text-primary font-bold'
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        <span>{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {filterAnchor.colKey === 'crew' && (
                        <div className="flex flex-col max-h-[380px]">
                            {/* Header */}
                            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 dark:border-gray-800 mb-1 shrink-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-gray-900 dark:text-white text-xs">Filter Crew</span>
                                    {isCrewFiltered && (
                                        <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                                            {crewFilter.length}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {isAllCrewSelected ? (
                                        <button
                                            type="button"
                                            onClick={deselectAllCrew}
                                            className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                                        >
                                            Deselect All
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={selectAllCrew}
                                                className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                                            >
                                                Select All
                                            </button>
                                            {crewFilter.length > 0 && (
                                                <>
                                                    <span className="text-gray-300 dark:text-gray-700">•</span>
                                                    <button
                                                        type="button"
                                                        onClick={deselectAllCrew}
                                                        className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer"
                                                    >
                                                        Clear
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Search Box inside Crew Popover */}
                            <div className="px-1 pb-1.5 shrink-0">
                                <div className="relative">
                                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={crewSearchQuery}
                                        onChange={(e) => setCrewSearchQuery(e.target.value)}
                                        placeholder="Search crew..."
                                        className="w-full text-xs pl-7 pr-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-primary text-gray-900 dark:text-white placeholder-gray-400"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Crew List */}
                            <div className="space-y-0.5 overflow-y-auto pr-1 scrollbar-thin flex-1 min-h-0">
                                {/* All Option */}
                                <div
                                    onClick={() => toggleCrewFilter('ALL')}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer select-none ${
                                        isAllCrewSelected
                                            ? 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white font-bold'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={isAllCrewSelected}
                                            onChange={() => {}}
                                            className="w-3.5 h-3.5 rounded text-primary focus:ring-primary/40 cursor-pointer accent-primary pointer-events-none"
                                        />
                                        <span className="text-xs">All Crew Members</span>
                                    </div>
                                </div>

                                {/* Unassigned Option */}
                                <div
                                    onClick={() => toggleCrewFilter('UNASSIGNED')}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer select-none ${
                                        crewFilter.includes('UNASSIGNED')
                                            ? 'bg-primary/10 text-primary font-bold'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={crewFilter.includes('UNASSIGNED')}
                                            onChange={() => {}}
                                            className="w-3.5 h-3.5 rounded text-primary focus:ring-primary/40 cursor-pointer accent-primary pointer-events-none"
                                        />
                                        <span className="text-xs">Unassigned (0 Crew)</span>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

                                {users
                                    .filter(u => !crewSearchQuery || u.name.toLowerCase().includes(crewSearchQuery.toLowerCase()))
                                    .map(u => {
                                        const isChecked = isAllCrewSelected || crewFilter.includes(u.id);
                                        return (
                                            <div
                                                key={u.id}
                                                onClick={() => toggleCrewFilter(u.id)}
                                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer select-none ${
                                                    isChecked
                                                        ? 'bg-primary/10 text-primary font-bold'
                                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {}}
                                                        className="w-3.5 h-3.5 rounded text-primary focus:ring-primary/40 cursor-pointer accent-primary pointer-events-none"
                                                    />
                                                    <span className="truncate text-xs">{u.name}</span>
                                                </div>
                                                <span className="text-[10px] text-gray-400 font-mono ml-2 shrink-0">{getRoleLabel(u.role)}</span>
                                            </div>
                                        );
                                    })}
                            </div>

                            {/* Footer */}
                            <div className="pt-2 mt-1.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 shrink-0">
                                <span className="text-[10px] text-gray-400">
                                    {isAllCrewSelected ? 'All crew selected' : `${crewFilter.length} member${crewFilter.length === 1 ? '' : 's'} selected`}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setFilterAnchor(null)}
                                    className="px-3 py-1 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 cursor-pointer shadow-2xs"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

            <WhatsAppDispatchModal
                isOpen={dispatchModalState.isOpen}
                onClose={() => setDispatchModalState(prev => ({ ...prev, isOpen: false }))}
                initialMessage={dispatchModalState.message}
                mentions={dispatchModalState.mentions}
                targetName={dispatchModalState.targetName}
                departmentId={dispatchModalState.departmentId}
            />
        </PullToRefresh>
    );
}
