'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Equipment, EquipmentStatus } from '@/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FacetFilters } from '@/components/FacetFilters';
import { storage } from '@/lib/storage';
import { downloadFile } from '@/lib/download';
import { Badge } from '@/components/Badge';
import { MobileScanner, QRScanner } from '@/components/QRScanner';
import { useAuth } from '@/lib/auth';
import { 
    ScanLine, Search, X, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, 
    ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, ArrowUpDown, List, LayoutGrid, 
    FileText, Check, Plus, RefreshCw, SlidersHorizontal, MoreVertical
} from 'lucide-react';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/dialog-context';
import { Skeleton } from '@/components/Skeleton';
import { useEquipment, useUpdateEquipment, useDeleteEquipment } from '@/hooks/useEquipment';
import { useUsers } from '@/hooks/useUsers';
import { useTransactions } from '@/hooks/useTransactions';
import { getEquipmentIssue, getIssueSummary, hasEquipmentIssue } from '@/lib/equipment-issues';
import { getEquipmentBarcodeBase, getMaxBarcodeNumber } from '@/lib/equipment-barcodes';
import { isConnectorCategory, buildConnectorName, buildConnectorCode, parseConnectorName, EndGender, ParsedConnector } from '@/lib/connectors';
import { canManageDataAssets, canManageItem, isDataAsset } from '@/lib/data-assets';
import { isRenameExcluded, isSafeToRename, proposedEquipmentName, renameLosesDetail } from '@/lib/equipment-naming';
import { canUseTool, type ToolId } from '@/lib/tool-permissions';
import { nameCovers } from '@/lib/equipment-naming';
import { itemDetailLineForRow } from '@/components/ItemIdentity';
import { useDepartment } from '@/lib/department-context';

type InventoryStatusFilter = EquipmentStatus | 'ALL' | 'NEEDS_ATTENTION';
type InventorySortField = 'name' | 'barcode' | 'category' | 'status' | 'location' | 'assignedToName' | 'createdAt' | 'brand' | 'model' | 'serialNumber';
type InventorySortDirection = 'asc' | 'desc';

interface InventoryStatusOption {
    value: InventoryStatusFilter;
    label: string;
    color: string;
}

const ALL_STATUS_OPTIONS: InventoryStatusOption[] = [
    { value: 'ALL', label: 'All Statuses', color: '#6b7280' },
    { value: 'AVAILABLE', label: 'Available', color: '#10b981' },
    { value: 'CHECKED_OUT', label: 'Checked Out', color: '#f97316' },
    { value: 'PENDING_VERIFICATION', label: 'Pending Verification', color: '#eab308' },
    { value: 'NEEDS_ATTENTION', label: 'Needs Attention', color: '#ef4444' },
    { value: 'MAINTENANCE', label: 'In Maintenance', color: '#f43f5e' },
    { value: 'DAMAGED', label: 'Damaged', color: '#dc2626' },
    { value: 'LOST', label: 'Lost', color: '#991b1b' },
];

export type InventoryColumnKey = 
    | 'select'
    | 'name'
    | 'brand'
    | 'model'
    | 'size'
    | 'category'
    | 'barcode'
    | 'serialNumber'
    | 'status'
    | 'action'
    | 'assignedToName'
    | 'location'
    | 'createdAt';

const DEFAULT_COLUMN_ORDER: InventoryColumnKey[] = [
    'select',
    'name',
    'category',
    'barcode',
    'status',
    'assignedToName',
    'location',
    'action',
    'brand',
    'model',
    'size',
    'serialNumber',
    'createdAt'
];

const DEFAULT_COLUMN_WIDTHS: Record<InventoryColumnKey, number> = {
    select: 40,
    name: 240,
    category: 130,
    barcode: 120,
    status: 130,
    assignedToName: 135,
    location: 160,
    action: 55,
    brand: 110,
    model: 120,
    size: 75,
    serialNumber: 110,
    createdAt: 105,
};

const getDefaultColumnWidths = (): Record<InventoryColumnKey, number> => ({ ...DEFAULT_COLUMN_WIDTHS });

const getSavedInventoryState = () => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem('inventoryListState');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const parseSavedStatusFilter = (val: any): InventoryStatusFilter[] => {
    if (Array.isArray(val)) {
        const valid = val.filter(v => typeof v === 'string');
        return valid.length > 0 ? (valid as InventoryStatusFilter[]) : ['ALL'];
    }
    if (typeof val === 'string' && val) return [val as InventoryStatusFilter];
    return ['ALL'];
};

// Normalize a category for grouping/matching: trim, collapse whitespace, lowercase.
const normalizeCat = (c?: string) => (c || '').trim().replace(/\s+/g, ' ').toLowerCase();

// ---- QR label designer config (persisted per-device) --------------------------
type LabelPos = 'top' | 'bottom' | 'left' | 'right';
interface LabelConfig {
    size: 'standard' | 'small';
    pageSize: 'a4' | 'a3';
    cellSize: number;    // mm — square cut cell (label pitch, same H & V so it cuts clean)
    fillSheet: boolean;  // enlarge the square to consume leftover space in the usable area
    marginX: number;     // mm — left/right page margin
    marginY: number;     // mm — top/bottom page margin
    cutGuides: boolean;  // draw a thin grid around each square cell to cut along
    qrMargin: number;    // QR quiet-zone in modules — lower = bigger QR / less white space
    gap: number;         // mm between QR and adjacent text
    fontSize: number;    // pt, the standard size for every label
    boldName: boolean;   // print the name/barcode bold (serial always normal)
    autoFit: boolean;    // shrink ONLY labels whose text is too long for the cell
    showQr: boolean;
    showName: boolean;
    namePos: LabelPos;
    showSerial: boolean;
    serialPos: LabelPos;
    maskSerial: boolean;
}
const DEFAULT_LABEL_CONFIG: LabelConfig = {
    size: 'standard',
    pageSize: 'a4',
    cellSize: 24,
    fillSheet: true,
    marginX: 10,
    marginY: 10,
    cutGuides: true,
    qrMargin: 2,
    gap: 1.5,
    fontSize: 8,
    boldName: true,
    autoFit: true,
    showQr: true,
    showName: true,
    namePos: 'bottom',
    showSerial: false,
    serialPos: 'bottom',
    maskSerial: true,
};
const LABEL_CONFIG_KEY = 'vpub_qr_label_config';
const loadLabelConfig = (): LabelConfig => {
    if (typeof window === 'undefined') return DEFAULT_LABEL_CONFIG;
    try {
        const raw = localStorage.getItem(LABEL_CONFIG_KEY);
        if (!raw) return DEFAULT_LABEL_CONFIG;
        return { ...DEFAULT_LABEL_CONFIG, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_LABEL_CONFIG;
    }
};
const maskSerialText = (s: string, mask: boolean) => {
    const t = (s || '').trim();
    if (!t) return '';
    if (!mask) return `S/N ${t}`;
    if (t.length <= 4) return `S/N ${t}`;
    return `S/N ****${t.slice(-4)}`;
};

// Single source of truth for the label sheet geometry, shared by the PDF generator and
// the live preview so what you see is exactly what prints. All units are mm.
interface QrLayout {
    pageW: number; pageH: number;
    marginX: number; marginY: number;
    cell: number; cols: number; rows: number;
    originX: number; originY: number;
    qrSize: number;
    topH: number; bottomH: number; leftW: number; rightW: number;
    contentW: number; contentH: number;
    lineH: number; gapLines: number; minFs: number;
}
const computeQrLayout = (cfg: LabelConfig): QrLayout => {
    const isA3 = cfg.pageSize === 'a3';
    const pageW = isA3 ? 297 : 210;
    const pageH = isA3 ? 420 : 297;
    const marginX = Math.max(0, cfg.marginX);
    const marginY = Math.max(0, cfg.marginY);
    const usableW = Math.max(10, pageW - marginX * 2);
    const usableH = Math.max(10, pageH - marginY * 2);
    const target = Math.max(10, cfg.cellSize);
    const cols = Math.max(1, Math.floor(usableW / target));
    const rows = Math.max(1, Math.floor(usableH / target));
    // Fill: grow the square to the largest that still fits cols×rows in the usable area,
    // so leftover white space is consumed and labels are as big as possible.
    const cell = cfg.fillSheet ? Math.min(usableW / cols, usableH / rows) : target;
    // Top-left align → any leftover collects at bottom/right, predictable to cut from a corner.
    const originX = marginX;
    const originY = marginY;
    const gap = cfg.gap;
    const lineH = cfg.fontSize * 0.3528 * 1.15;
    const gapLines = Math.max(0.3, cfg.gap * 0.4);
    const countAt = (p: LabelPos) => (cfg.showName && cfg.namePos === p ? 1 : 0) + (cfg.showSerial && cfg.serialPos === p ? 1 : 0);
    const stackH = (n: number) => (n > 0 ? n * lineH + (n - 1) * gapLines : 0);
    const topH = stackH(countAt('top'));
    const bottomH = stackH(countAt('bottom'));
    const leftW = stackH(countAt('left'));
    const rightW = stackH(countAt('right'));
    const pad = 1.2;
    const reservedV = topH + (topH ? gap : 0) + (bottomH ? gap : 0) + bottomH;
    const reservedH = leftW + (leftW ? gap : 0) + (rightW ? gap : 0) + rightW;
    const qrSize = cfg.showQr ? Math.max(6, Math.min(cell - pad * 2 - reservedV, cell - pad * 2 - reservedH)) : 0;
    const contentW = leftW + (leftW ? gap : 0) + qrSize + (rightW ? gap : 0) + rightW;
    const contentH = topH + (topH ? gap : 0) + qrSize + (bottomH ? gap : 0) + bottomH;
    const minFs = cfg.size === 'small' ? 3.5 : 4.5;
    return { pageW, pageH, marginX, marginY, cell, cols, rows, originX, originY, qrSize, topH, bottomH, leftW, rightW, contentW, contentH, lineH, gapLines, minFs };
};
const availForPos = (p: LabelPos, cell: number, qrH: number) =>
    (p === 'top' || p === 'bottom') ? (cell - 2) : (qrH || (cell - 4));
// Font size for ONE label line: the standard cfg.fontSize, shrunk only when the text is
// too long for its slot AND auto-fit is on. Each label is judged on its own — so short
// names stay at the standard size and only oversized ones get smaller.
const fitFontFor = (
    text: string,
    pos: LabelPos,
    bold: boolean,
    cfg: LabelConfig,
    L: QrLayout,
    measure: (text: string, bold: boolean, fontSize: number) => number,
) => {
    if (!text) return cfg.fontSize;
    if (!cfg.autoFit) return cfg.fontSize;
    const w = measure(text, bold, cfg.fontSize);
    const avail = availForPos(pos, L.cell, L.qrSize);
    if (w > avail) return Math.max(L.minFs, Math.floor(cfg.fontSize * (avail / w) * 10) / 10);
    return cfg.fontSize;
};

const InlineInput = ({ value, onChange, placeholder }: { value: string, onChange: (v: string) => void, placeholder?: string }) => {
    const [val, setVal] = useState(value);
    useEffect(() => { setVal(value); }, [value]);
    
    return (
        <input
            type="text"
            value={val || ''}
            placeholder={placeholder}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
                if (val !== value) onChange(val);
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.currentTarget.blur();
                }
            }}
            className="w-full bg-background border border-border/50 hover:border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        />
    );
};

function InventoryPageContent() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const { department, hasFeature } = useDepartment();
    // One gate for every bulk tool, so which of them a manager gets is a department setting
    // rather than a role list buried at each button.
    const can = React.useCallback(
        (tool: ToolId) => canUseTool(user, tool, department),
        [user, department]
    );

    // TanStack Query Hooks
    const { data: items = [], isLoading: equipmentLoading, refetch: refresh } = useEquipment();
    const { data: usersList = [], isLoading: usersLoading } = useUsers();
    // Import transactions to cross-reference status
    const { data: transactions = [] } = useTransactions();
    const { mutateAsync: updateEquipment } = useUpdateEquipment();
    const { mutateAsync: deleteEquipment } = useDeleteEquipment();

    const isInventoryLoading = authLoading || equipmentLoading || usersLoading;

    // Derived state for users map
    const users = useMemo(() => {
        const map: Record<string, string> = {};
        usersList.forEach(u => {
            map[u.id] = u.name || u.email || 'Unknown';
        });
        return map;
    }, [usersList]);

    // Calculate items that need cleanup
    // 1. Available but have assignee
    // 2. Checked out but not in any OPEN transaction
    // 3. In OPEN transaction but NOT marked Checked Out
    const cleanupData = useMemo(() => {
        const activeTransactionItemMap = new Map<string, { userId?: string }>();
        transactions
            .filter(t => t.status === 'OPEN')
            .forEach(t => {
                t.items?.forEach(itemId => {
                    const isReturnedInTxn = t.postReturnConditions?.[itemId] !== undefined;
                    if (!isReturnedInTxn) {
                        activeTransactionItemMap.set(itemId, { userId: t.userId });
                    }
                });
            });

        const staleAssignments = items.filter(i => i.status === 'AVAILABLE' && i.assignedTo);
        const ghostCheckouts = items.filter(i =>
            i.status === 'CHECKED_OUT' && !activeTransactionItemMap.has(i.id)
        );
        const unmarkedCheckouts = items.filter(i =>
            activeTransactionItemMap.has(i.id) && i.status !== 'CHECKED_OUT' && i.status !== 'PENDING_VERIFICATION'
        );

        return { staleAssignments, ghostCheckouts, unmarkedCheckouts, activeTransactionItemMap };
    }, [items, transactions]);

    const formatCleanupItem = (item: Equipment) => {
        const assignedTo = item.assignedTo ? (users[item.assignedTo] || item.assignedTo) : 'None';
        const serial = item.serialNumber ? ` | S/N: ${item.serialNumber}` : '';
        return `- ${item.name} (${item.barcode}${serial})\n  Status: ${item.status.replace('_', ' ')} | Assigned: ${assignedTo} | Location: ${item.location || 'N/A'}`;
    };

    const formatCleanupSection = (title: string, issueItems: Equipment[]) => {
        const previewItems = issueItems.slice(0, 5).map(formatCleanupItem).join('\n');
        const remainingCount = issueItems.length - 5;
        return `${title} (${issueItems.length}):\n${previewItems}${remainingCount > 0 ? `\n...and ${remainingCount} more` : ''}`;
    };

    const cleanupAssignments = async (itemsToCleanup: Equipment[]) => {
        await Promise.all(itemsToCleanup.map(item =>
            updateEquipment({ id: item.id, updates: { assignedTo: null as unknown as string } })
        ));
    };

    // Fix items that are falsely marked as checked out
    const cleanupGhostCheckouts = async (itemsToFix: Equipment[]) => {
        await Promise.all(itemsToFix.map(item =>
            updateEquipment({
                id: item.id,
                updates: {
                    status: 'AVAILABLE',
                    assignedTo: null as unknown as string,
                    location: 'Storage'
                }
            })
        ));
    };

    // Fix items that are in open transactions but not marked checked out
    const cleanupUnmarkedCheckouts = async (itemsToFix: Equipment[], activeMap: Map<string, { userId?: string }>) => {
        await Promise.all(itemsToFix.map(item =>
            updateEquipment({
                id: item.id,
                updates: {
                    status: 'CHECKED_OUT',
                    assignedTo: activeMap.get(item.id)?.userId || (null as unknown as string),
                    lastActivity: new Date().toISOString()
                }
            })
        ));
    };

    const handleCleanupAssignments = async () => {
        if (isActionLoading) return;

        const { staleAssignments, ghostCheckouts, unmarkedCheckouts, activeTransactionItemMap } = cleanupData;
        const totalIssues = staleAssignments.length + ghostCheckouts.length + unmarkedCheckouts.length;

        if (totalIssues === 0) {
            showToast('No data inconsistencies found', 'info');
            return;
        }

        const messageParts = [`Found ${totalIssues} issue${totalIssues === 1 ? '' : 's'}:`];

        if (unmarkedCheckouts.length) {
            messageParts.push(formatCleanupSection('Checked-out items not marked in inventory', unmarkedCheckouts));
        }

        if (staleAssignments.length) {
            messageParts.push(formatCleanupSection('Available items with stale assignees', staleAssignments));
        }

        if (ghostCheckouts.length) {
            messageParts.push(formatCleanupSection('Checked-out items without an active transaction', ghostCheckouts));
        }

        messageParts.push('Fix All will reconcile item statuses with active transactions and clear stale assignees.');

        const isConfirmed = await confirm({
            title: 'Fix Data Inconsistencies?',
            message: messageParts.join('\n\n'),
            confirmLabel: 'Fix All',
            variant: 'danger'
        });

        if (!isConfirmed) return;

        setIsActionLoading(true);
        try {
            if (unmarkedCheckouts.length > 0) await cleanupUnmarkedCheckouts(unmarkedCheckouts, activeTransactionItemMap);
            if (staleAssignments.length > 0) await cleanupAssignments(staleAssignments);
            if (ghostCheckouts.length > 0) await cleanupGhostCheckouts(ghostCheckouts);

            showToast(`Fixed ${totalIssues} data inconsistencies`, 'success');
            refresh(); // Refresh data
        } catch (error) {
            console.error('Cleanup failed:', error);
            showToast('Cleanup failed', 'error');
        } finally {
            setIsActionLoading(false);
        }
    };

    const savedState = useMemo(() => getSavedInventoryState(), []);

    const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
        if (typeof window !== 'undefined') {
            return (sessionStorage.getItem('inventoryViewMode') as 'grid' | 'list') || savedState?.viewMode || (window.innerWidth >= 768 ? 'list' : 'grid');
        }
        return 'list';
    });

    const [search, setSearch] = useState(() => {
        if (typeof window !== 'undefined') return sessionStorage.getItem('inventorySearch') || savedState?.search || '';
        return '';
    });

    const [showInventoryScanner, setShowInventoryScanner] = useState(false);
    const searchParams = useSearchParams();

    const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter[]>(() => {
        const statusParam = searchParams.get('status');
        if (statusParam && ['ALL', 'AVAILABLE', 'CHECKED_OUT', 'PENDING_VERIFICATION', 'NEEDS_ATTENTION', 'MAINTENANCE', 'DAMAGED', 'LOST'].includes(statusParam)) {
            return [statusParam as InventoryStatusFilter];
        }
        return parseSavedStatusFilter(savedState?.statusFilter);
    });

    // Multiple categories/brands/sizes can be active at once. Empty array = all.
    const [categoryFilter, setCategoryFilter] = useState<string[]>(() => {
        if (Array.isArray(savedState?.categoryFilter)) return savedState.categoryFilter;
        if (typeof savedState?.categoryFilter === 'string' && savedState.categoryFilter !== 'ALL') return [savedState.categoryFilter];
        return [];
    });

    const [assigneeFilter, setAssigneeFilter] = useState<string>(() => savedState?.assigneeFilter || 'ALL');
    const [locationFilter, setLocationFilter] = useState<string>(() => savedState?.locationFilter || 'ALL');
    const [brandFilter, setBrandFilter] = useState<string[]>(() => savedState?.brandFilter || []);
    const [sizeFilter, setSizeFilter] = useState<string[]>(() => savedState?.sizeFilter || []);
    const [endFilter, setEndFilter] = useState<string[]>(() => savedState?.endFilter || []);
    const [showFilters, setShowFilters] = useState<boolean>(() => savedState?.showFilters ?? false);

    // Sorting state
    const [sortField, setSortField] = useState<InventorySortField>(() => savedState?.sortField || 'name');
    const [sortDirection, setSortDirection] = useState<InventorySortDirection>(() => savedState?.sortDirection || 'asc');

    // Pagination state
    const [pageSize, setPageSize] = useState<number | 'ALL'>(() => savedState?.pageSize ?? 50);
    const [currentPage, setCurrentPage] = useState<number>(() => {
        if (typeof window !== 'undefined') {
            try {
                const explicit = sessionStorage.getItem('inventoryCurrentPage');
                if (explicit) {
                    const parsed = parseInt(explicit, 10);
                    if (!isNaN(parsed) && parsed > 0) return parsed;
                }
            } catch {}
        }
        return savedState?.currentPage ?? 1;
    });

    // Popover Anchor State for column filter dropdowns
    const [filterAnchor, setFilterAnchor] = useState<{
        top: number;
        left: number;
        type: 'status' | 'category' | 'assignee' | 'location';
    } | null>(null);
    const headerFilterRef = useRef<HTMLDivElement>(null);
    const [categorySearchQuery, setCategorySearchQuery] = useState('');
    const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');
    const cardScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const [isTableScrolled, setIsTableScrolled] = useState(false);

    // Column Order State
    const [columnOrder, setColumnOrder] = useState<InventoryColumnKey[]>(() => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.removeItem('inventory_column_order_v1');
                const saved = localStorage.getItem('inventory_column_order_v2');
                if (saved) {
                    const parsed: InventoryColumnKey[] = JSON.parse(saved);
                    const allKeys = [...DEFAULT_COLUMN_ORDER];
                    const filtered = parsed.filter(k => allKeys.includes(k));
                    allKeys.forEach(k => { if (!filtered.includes(k)) filtered.push(k); });
                    return filtered;
                }
            } catch {}
        }
        return DEFAULT_COLUMN_ORDER;
    });

    // Visible Columns State (persisted per device, 8 core columns default for laptop fit)
    const [visibleColumns, setVisibleColumns] = useState<InventoryColumnKey[]>(() => {
        const DEFAULT_VISIBLE: InventoryColumnKey[] = [
            'select', 'name', 'category', 'barcode', 'status', 'assignedToName', 'location', 'action'
        ];
        if (typeof window !== 'undefined') {
            try {
                // Clear obsolete v1 caches that had 12 bloated columns
                localStorage.removeItem('inventory_visible_columns_v1');
                localStorage.removeItem('inventory_table_col_widths_v1');
                localStorage.removeItem('inventory_has_custom_col_widths_v1');

                const saved = localStorage.getItem('inventory_visible_columns_v2');
                if (saved) {
                    const parsed: InventoryColumnKey[] = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length >= 3) {
                        const safe = Array.from(new Set(['select', 'name', ...parsed]));
                        return safe as InventoryColumnKey[];
                    }
                }
            } catch {}
        }
        return DEFAULT_VISIBLE;
    });

    // Column Widths State (persisted per device if customized, otherwise uses fluid CSS flex system)
    const [hasUserCustomWidths, setHasUserCustomWidths] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('inventory_has_custom_col_widths_v4') === 'true';
        }
        return false;
    });

    const [colWidths, setColWidths] = useState<Record<InventoryColumnKey, number>>(() => {
        if (typeof window !== 'undefined') {
            try {
                // Clear obsolete caches
                localStorage.removeItem('inventory_table_col_widths_v1');
                localStorage.removeItem('inventory_has_custom_col_widths_v1');
                localStorage.removeItem('inventory_table_col_widths_v2');
                localStorage.removeItem('inventory_has_custom_col_widths_v2');
                localStorage.removeItem('inventory_table_col_widths_v3');
                localStorage.removeItem('inventory_has_custom_col_widths_v3');

                const saved = localStorage.getItem('inventory_table_col_widths_v4');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed === 'object') {
                        return { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
                    }
                }
            } catch {}
        }
        return { ...DEFAULT_COLUMN_WIDTHS };
    });

    // Track horizontal scrolling for sticky column boundary shadow
    useEffect(() => {
        const el = tableScrollRef.current;
        if (!el) return;
        const handleScroll = () => {
            setIsTableScrolled(el.scrollLeft > 3);
        };
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, []);

    const [resizingCol, setResizingCol] = useState<InventoryColumnKey | null>(null);
    const resizeStartX = useRef<number>(0);
    const resizeStartWidth = useRef<number>(0);
    const headerRef = useRef<HTMLDivElement>(null);
    const columnMenuRef = useRef<HTMLDivElement>(null);
    const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

    // Column Resizing Handlers (Mouse & Touch)
    const handleMouseDownResize = (colKey: InventoryColumnKey, e: React.MouseEvent) => {
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
        try {
            localStorage.setItem('inventory_has_custom_col_widths_v4', 'true');
        } catch {}
        resizeStartX.current = e.clientX;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            const delta = moveEvent.clientX - resizeStartX.current;
            const minW = colKey === 'select' ? 38 : colKey === 'name' ? 140 : colKey === 'status' ? 100 : colKey === 'action' ? 55 : 50;
            const newWidth = Math.max(minW, Math.round(resizeStartWidth.current + delta));
            setColWidths(prev => {
                const updated = { ...prev, [colKey]: newWidth };
                try {
                    localStorage.setItem('inventory_table_col_widths_v4', JSON.stringify(updated));
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

    const handleTouchStartResize = (colKey: InventoryColumnKey, e: React.TouchEvent) => {
        if (e.touches.length !== 1) return;
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

        resizeStartX.current = e.touches[0].clientX;
        setResizingCol(colKey);
        setHasUserCustomWidths(true);
        try {
            localStorage.setItem('inventory_has_custom_col_widths_v4', 'true');
        } catch {}

        const handleTouchMove = (moveEvent: TouchEvent) => {
            if (moveEvent.touches.length !== 1) return;
            const delta = moveEvent.touches[0].clientX - resizeStartX.current;
            const minW = colKey === 'select' ? 38 : colKey === 'name' ? 140 : colKey === 'status' ? 100 : colKey === 'action' ? 55 : 50;
            const newWidth = Math.max(minW, Math.round(resizeStartWidth.current + delta));
            setColWidths(prev => {
                const updated = { ...prev, [colKey]: newWidth };
                try {
                    localStorage.setItem('inventory_table_col_widths_v4', JSON.stringify(updated));
                } catch {}
                return updated;
            });
        };

        const handleTouchEnd = () => {
            setResizingCol(null);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };

        document.addEventListener('touchmove', handleTouchMove, { passive: true });
        document.addEventListener('touchend', handleTouchEnd);
    };

    // Drag and Drop Column Reordering State
    const [draggedCol, setDraggedCol] = useState<InventoryColumnKey | null>(null);
    const [dragOverCol, setDragOverCol] = useState<InventoryColumnKey | null>(null);

    const handleHeaderDragStart = (colKey: InventoryColumnKey, e: React.DragEvent) => {
        if (colKey === 'select' || colKey === 'name') return;
        setDraggedCol(colKey);
        e.dataTransfer.setData('text/plain', colKey);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleHeaderDragOver = (colKey: InventoryColumnKey, e: React.DragEvent) => {
        if (colKey === 'select' || colKey === 'name') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverCol !== colKey) {
            setDragOverCol(colKey);
        }
    };

    const handleHeaderDrop = (targetColKey: InventoryColumnKey, e: React.DragEvent) => {
        e.preventDefault();
        if (!draggedCol || draggedCol === targetColKey || targetColKey === 'select' || targetColKey === 'name') {
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
                    localStorage.setItem('inventory_column_order_v2', JSON.stringify(next));
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

    const moveColumn = (colKey: InventoryColumnKey, direction: 'up' | 'down') => {
        if (colKey === 'select' || colKey === 'name') return;
        setColumnOrder(prev => {
            const next = [...prev];
            const idx = next.indexOf(colKey);
            if (idx === -1) return prev;
            const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
            if (targetIdx < 2 || targetIdx >= next.length) return prev;
            const [removed] = next.splice(idx, 1);
            next.splice(targetIdx, 0, removed);
            try {
                localStorage.setItem('inventory_column_order_v2', JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    const toggleColumn = (colId: InventoryColumnKey) => {
        if (colId === 'select' || colId === 'name') return;
        setVisibleColumns(prev => {
            const next = prev.includes(colId)
                ? (prev.length > 2 ? prev.filter(c => c !== colId) : prev)
                : [...prev, colId];
            try {
                localStorage.setItem('inventory_visible_columns_v2', JSON.stringify(next));
            } catch {}
            if (!hasUserCustomWidths) {
                setColWidths({ ...DEFAULT_COLUMN_WIDTHS });
            }
            return next;
        });
    };

    const handleResetColumns = () => {
        const defaultVisible: InventoryColumnKey[] = [
            'select', 'name', 'category', 'barcode', 'status', 'assignedToName', 'location', 'action'
        ];
        setVisibleColumns(defaultVisible);
        setColumnOrder(DEFAULT_COLUMN_ORDER);
        setHasUserCustomWidths(false);
        setColWidths({ ...DEFAULT_COLUMN_WIDTHS });
        try {
            localStorage.removeItem('inventory_visible_columns_v2');
            localStorage.removeItem('inventory_column_order_v2');
            localStorage.removeItem('inventory_table_col_widths_v4');
            localStorage.removeItem('inventory_has_custom_col_widths_v4');
            localStorage.removeItem('inventory_table_col_widths_v3');
            localStorage.removeItem('inventory_has_custom_col_widths_v3');
            localStorage.removeItem('inventory_table_col_widths_v2');
            localStorage.removeItem('inventory_has_custom_col_widths_v2');
            localStorage.removeItem('inventory_visible_columns_v1');
            localStorage.removeItem('inventory_column_order_v1');
            localStorage.removeItem('inventory_table_col_widths_v1');
            localStorage.removeItem('inventory_has_custom_col_widths_v1');
        } catch {}
    };

    const ALL_COLUMNS: { id: InventoryColumnKey; label: string; defaultVisible: boolean; mandatory?: boolean }[] = useMemo(() => [
        { id: 'select', label: 'Select', defaultVisible: true, mandatory: true },
        { id: 'name', label: 'Equipment Name', defaultVisible: true, mandatory: true },
        { id: 'category', label: 'Category', defaultVisible: true },
        { id: 'barcode', label: 'Barcode', defaultVisible: true },
        { id: 'status', label: 'Status', defaultVisible: true },
        { id: 'assignedToName', label: 'Assignee', defaultVisible: true },
        { id: 'location', label: 'Location', defaultVisible: true },
        { id: 'action', label: 'Action', defaultVisible: true },
        { id: 'brand', label: 'Brand', defaultVisible: false },
        { id: 'model', label: 'Model', defaultVisible: false },
        { id: 'size', label: 'Size', defaultVisible: false },
        { id: 'serialNumber', label: 'S/N', defaultVisible: false },
        { id: 'createdAt', label: 'Added Date', defaultVisible: false },
    ], []);

    const orderedVisibleColumns = useMemo(() => {
        return columnOrder.filter(colKey => visibleColumns.includes(colKey));
    }, [columnOrder, visibleColumns]);

    const minTableWidth = useMemo(() => {
        const minWMap: Record<InventoryColumnKey, number> = {
            select: 40,
            name: colWidths.name || 240,
            action: 55,
            location: 135,
            assignedToName: 120,
            category: 115,
            model: 105,
            brand: 100,
            barcode: 110,
            status: 115,
            serialNumber: 100,
            size: 65,
            createdAt: 95,
        };
        return orderedVisibleColumns.reduce((sum, col) => sum + (minWMap[col] || 80), 0) + 36;
    }, [orderedVisibleColumns, colWidths.name]);

    const getColumnStyle = (colKey: InventoryColumnKey): React.CSSProperties => {
        const w = colWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 100;

        // Pinned Selection Checkbox (fixed 40px)
        if (colKey === 'select') {
            return {
                width: '40px',
                minWidth: '40px',
                maxWidth: '40px',
                flexShrink: 0,
                boxSizing: 'border-box',
            };
        }

        // Pinned Equipment Name (compact, snug, fixed so it never inflates into an empty void)
        if (colKey === 'name') {
            const nameW = Math.max(160, w);
            return {
                width: `${nameW}px`,
                minWidth: `${nameW}px`,
                maxWidth: `${nameW}px`,
                flexShrink: 0,
                boxSizing: 'border-box',
            };
        }

        // Action Column (Print QR Button - fixed 55px)
        if (colKey === 'action') {
            return {
                width: '55px',
                minWidth: '55px',
                maxWidth: '55px',
                flexShrink: 0,
                boxSizing: 'border-box',
            };
        }

        // Proportional Flexible Data Columns:
        // Automatically stretch to fill 100% of the screen width on large monitors with zero right-side blank space!
        const flexWeights: Partial<Record<InventoryColumnKey, { grow: number; minW: number }>> = {
            location: { grow: 1.6, minW: 135 },
            assignedToName: { grow: 1.25, minW: 120 },
            category: { grow: 1.15, minW: 115 },
            model: { grow: 1.05, minW: 105 },
            brand: { grow: 0.95, minW: 100 },
            barcode: { grow: 0.85, minW: 110 },
            status: { grow: 0.75, minW: 115 },
            serialNumber: { grow: 0.95, minW: 100 },
            size: { grow: 0.65, minW: 65 },
            createdAt: { grow: 0.85, minW: 95 },
        };

        const config = flexWeights[colKey] || { grow: 1.0, minW: 80 };
        return {
            flex: `${config.grow} 1 ${w}px`,
            minWidth: `${config.minW}px`,
            boxSizing: 'border-box',
        };
    };

    // Close 3-dots column configuration menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (isColumnMenuOpen && columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
                setIsColumnMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isColumnMenuOpen]);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [isGeneratingQR, setIsGeneratingQR] = useState(false);
    // QR label designer: live-editable config, persisted per device.
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [labelConfig, setLabelConfig] = useState<LabelConfig>(DEFAULT_LABEL_CONFIG);
    const [previewQr, setPreviewQr] = useState('');
    const [previewFit, setPreviewFit] = useState<{ name: number; serial: number }>({ name: DEFAULT_LABEL_CONFIG.fontSize, serial: DEFAULT_LABEL_CONFIG.fontSize });
    const setCfg = <K extends keyof LabelConfig>(key: K, val: LabelConfig[K]) => setLabelConfig(c => ({ ...c, [key]: val }));

    // Hydrate saved config on mount (client only, avoids SSR mismatch).
    useEffect(() => { setLabelConfig(loadLabelConfig()); }, []);
    // Local loading state for non-query async actions if needed, though query handles most
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [isBulkEditMode, setIsBulkEditMode] = useState(false);
    // Find & Replace across bulk fields
    const [frOpen, setFrOpen] = useState(false);
    const [frFind, setFrFind] = useState('');
    const [frReplace, setFrReplace] = useState('');
    const [frField, setFrField] = useState<'all' | 'name' | 'barcode' | 'category' | 'model' | 'size'>('all');
    const [frCase, setFrCase] = useState(false);
    const [frApplying, setFrApplying] = useState(false);
    // Bulk barcode generation (standard scheme: Category prefix + Model code + №)
    const [bcOpen, setBcOpen] = useState(false);
    const [bcApplying, setBcApplying] = useState(false);
    // Normalize connectors (group by name → structured ends/size)
    const [ncOpen, setNcOpen] = useState(false);
    const [ncApplying, setNcApplying] = useState(false);
    const [ncEdits, setNcEdits] = useState<Record<string, ParsedConnector>>({});
    const [editDrafts, setEditDrafts] = useState<Record<string, Partial<Equipment>>>({});
    const [isSavingDrafts, setIsSavingDrafts] = useState(false);

    const handleDraftChange = (id: string, field: keyof Equipment, value: string) => {
        setEditDrafts(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: value
            }
        }));
    };

    // Model lives in the JSONB metadata column. updateEquipment writes metadata as a
    // whole-column replace, so we merge onto the existing metadata (draft-in-progress
    // first, else the item's) to avoid clobbering brand / activeIssue / etc.
    const handleMetadataDraftChange = (item: Equipment, key: string, value: string) => {
        setEditDrafts(prev => {
            const baseMeta = prev[item.id]?.metadata ?? item.metadata ?? {};
            return {
                ...prev,
                [item.id]: {
                    ...prev[item.id],
                    metadata: { ...baseMeta, [key]: value },
                },
            };
        });
    };

    // Persist UI state to sessionStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                sessionStorage.setItem('inventoryListState', JSON.stringify({
                    viewMode,
                    search,
                    statusFilter,
                    categoryFilter,
                    assigneeFilter,
                    locationFilter,
                    brandFilter,
                    sizeFilter,
                    endFilter,
                    showFilters,
                    sortField,
                    sortDirection,
                    pageSize,
                    currentPage
                }));
                sessionStorage.setItem('inventoryCurrentPage', String(currentPage));
                sessionStorage.setItem('inventoryViewMode', viewMode);
                sessionStorage.setItem('inventorySearch', search);
            } catch {}
        }
    }, [viewMode, search, statusFilter, categoryFilter, assigneeFilter, locationFilter, brandFilter, sizeFilter, endFilter, showFilters, sortField, sortDirection, pageSize, currentPage]);

    // Close column/header filter popover on outside click, resize, or scroll
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (headerFilterRef.current && !headerFilterRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement;
                if (target.closest('[data-filter-trigger]')) return;
                setFilterAnchor(null);
            }
        };
        const handleScrollOrResize = (e: Event) => {
            if (e.type === 'scroll' && e.target instanceof Node && headerFilterRef.current?.contains(e.target)) {
                return;
            }
            setFilterAnchor(null);
        };
        if (filterAnchor) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('resize', handleScrollOrResize);
            window.addEventListener('scroll', handleScrollOrResize, true);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', handleScrollOrResize);
            window.removeEventListener('scroll', handleScrollOrResize, true);
        };
    }, [filterAnchor]);

    // Sample item that drives the label designer's live preview.
    const sampleLabelItem = useMemo(() => {
        const sel = items.find(i => selectedItems.has(i.id) && i.barcode?.trim());
        const any = sel || items.find(i => i.barcode?.trim());
        return {
            barcode: any?.barcode || 'CAM-SAMPLE-1',
            serialNumber: any?.serialNumber || '1234567890',
        };
    }, [items, selectedItems]);

    // Regenerate the preview QR when the designer is open and its inputs change.
    useEffect(() => {
        if (!qrModalOpen) return;
        let cancelled = false;
        (async () => {
            try {
                const QRCode = (await import('qrcode')).default;
                const url = await QRCode.toDataURL(sampleLabelItem.barcode, {
                    width: 256,
                    margin: labelConfig.qrMargin,
                    errorCorrectionLevel: 'H',
                });
                if (!cancelled) setPreviewQr(url);
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [qrModalOpen, labelConfig.qrMargin, sampleLabelItem.barcode]);

    // Measure (with jsPDF's own metrics) the exact size the sample label's name + serial
    // will print at, so the live preview text matches the PDF — including per-line auto-fit.
    useEffect(() => {
        if (!qrModalOpen) return;
        let cancelled = false;
        (async () => {
            try {
                const pdfModule = await import('jspdf');
                const jsPDF = pdfModule.jsPDF || pdfModule.default;
                const pdf = new jsPDF({ orientation: 'portrait', format: labelConfig.pageSize, unit: 'mm' });
                const L = computeQrLayout(labelConfig);
                const measure = (text: string, bold: boolean, fs: number) => {
                    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
                    pdf.setFontSize(fs);
                    return pdf.getTextWidth(text);
                };
                const nameFs = fitFontFor(sampleLabelItem.barcode, labelConfig.namePos, labelConfig.boldName, labelConfig, L, measure);
                const serialFs = fitFontFor(maskSerialText(sampleLabelItem.serialNumber, labelConfig.maskSerial), labelConfig.serialPos, false, labelConfig, L, measure);
                if (!cancelled) setPreviewFit({ name: nameFs, serial: serialFs });
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [qrModalOpen, labelConfig, sampleLabelItem]);

    // Open an item detail while remembering where we were: save the list scroll
    // position so returning (via the sticky Back) lands on the same spot with the
    // same search still applied.
    // Briefly flash the row/card we return to.
    const [flashBarcode, setFlashBarcode] = useState('');

    const openItem = (barcode: string) => {
        if (typeof window !== 'undefined') {
            const scroller = document.querySelector('.inventory-table-scroll') || document.querySelector('.inventory-card-scroll') || document.querySelector('.app-main-scroll');
            sessionStorage.setItem('inventoryScroll', String(scroller?.scrollTop ?? 0));
            sessionStorage.setItem('inventoryFlash', barcode);
            sessionStorage.setItem('inventoryCurrentPage', String(currentPage));
        }
        router.push(`/inventory/${barcode}`);
    };

    // Restore scroll on return. rAF defers past AppLayout's on-navigation
    // scroll-to-top (a parent effect that would otherwise win) so ours sticks.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = sessionStorage.getItem('inventoryScroll');
        const flash = sessionStorage.getItem('inventoryFlash');
        // Consume both: one-shot, so a later fresh visit to Inventory starts at top
        // instead of jumping to a stale saved position / flashing a stale row.
        sessionStorage.removeItem('inventoryScroll');
        sessionStorage.removeItem('inventoryFlash');
        if (flash) setFlashBarcode(flash);
        const y = Number(saved);
        let raf = 0;
        if (y) {
            raf = requestAnimationFrame(() => {
                const scroller = document.querySelector('.inventory-table-scroll') || document.querySelector('.inventory-card-scroll') || document.querySelector('.app-main-scroll');
                if (scroller) scroller.scrollTop = y;
            });
        }
        return () => { if (raf) cancelAnimationFrame(raf); };
        // Run once on mount — after data (React Query cache) has rendered rows.
    }, []);

    // Scroll to the restored item and highlight it once the DOM renders
    useEffect(() => {
        if (!flashBarcode) return;
        const tryScroll = () => {
            const targetEl = document.getElementById(`inventory-row-${flashBarcode}`) || 
                             document.getElementById(`inventory-card-${flashBarcode}`) ||
                             document.querySelector(`[data-inventory-barcode="${flashBarcode}"]`);
            if (targetEl) {
                targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
                return true;
            }
            return false;
        };

        if (!tryScroll()) {
            const t1 = setTimeout(tryScroll, 100);
            const t2 = setTimeout(tryScroll, 300);
            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
            };
        }
    }, [flashBarcode]);

    // Narrowing the list doesn't move the scroll position, so filtering 500 rows down to 2
    // leaves you parked in the empty space where the rest of the list used to be. Reset to the
    // top whenever the filter selection changes — skipping the first run, which would fight
    // the scroll restore above.
    const filterSignature = JSON.stringify([statusFilter, categoryFilter, assigneeFilter, locationFilter, brandFilter, sizeFilter, endFilter]);
    const lastFilterSignature = React.useRef<string | null>(null);
    useEffect(() => {
        if (lastFilterSignature.current === null) {
            lastFilterSignature.current = filterSignature;
            return;
        }
        if (lastFilterSignature.current === filterSignature) return;
        lastFilterSignature.current = filterSignature;

        const scroller = document.querySelector('.app-main-scroll');
        if (!scroller || scroller.scrollTop === 0) return;

        // Instant, not smooth: a smooth scroll animates for ~300ms, and while it runs the
        // filtered-out rows unmount. The browser's scroll anchoring then adjusts the offset to
        // keep the remaining content steady, which drags the view back down mid-animation —
        // the "goes up then comes back" jump. Setting it directly, then once more after the
        // next paint, lands it regardless of which happens first.
        scroller.scrollTop = 0;
        const raf = requestAnimationFrame(() => { scroller.scrollTop = 0; });
        return () => cancelAnimationFrame(raf);
    }, [filterSignature]);

    // Auto-clear the flash after a moment (own effect keyed on flashBarcode, so the
    // timer survives StrictMode double-invoke of the trigger effects → fade-out works).
    useEffect(() => {
        if (!flashBarcode) return;
        const t = setTimeout(() => setFlashBarcode(''), 2200);
        return () => clearTimeout(t);
    }, [flashBarcode]);

    // Back navigation may reuse this page from the App Router cache WITHOUT remounting,
    // so the mount effect above won't re-run. This popstate listener (persists while the
    // page is cached) catches Back and flashes the row we returned to.
    useEffect(() => {
        const onPop = () => {
            const flash = sessionStorage.getItem('inventoryFlash');
            if (!flash) return;
            sessionStorage.removeItem('inventoryFlash');
            setFlashBarcode(flash);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const parseInventoryScanCode = (decodedText: string) => {
        try {
            const data = JSON.parse(decodedText);
            return String(data.id || data.barcode || decodedText).trim();
        } catch {
            return decodedText.trim();
        }
    };

    const findItemForLookup = (value: string) => {
        const query = value.trim().toLowerCase();
        if (!query) return null;

        return items.find(item =>
            item.barcode.toLowerCase() === query ||
            item.id.toLowerCase() === query ||
            item.serialNumber?.toLowerCase() === query
        ) || null;
    };

    const openLookupItem = (value: string) => {
        const lookup = value.trim();
        if (!lookup) return;

        const exactMatch = findItemForLookup(lookup);
        if (exactMatch) {
            setShowInventoryScanner(false);
            router.push(`/inventory/${encodeURIComponent(exactMatch.barcode)}`);
            return;
        }

        setSearch(lookup);
        showToast('No exact item found. Showing matching inventory results.', 'warning');
    };

    const handleInventoryScan = (decodedText: string) => {
        const code = parseInventoryScanCode(decodedText);
        setSearch(code);
        openLookupItem(code);
    };

    // Redirect if not authenticated
    useEffect(() => {
        if (!authLoading && !user) {
            router.replace('/login');
        }
    }, [user, router, authLoading]);

    // ... (rest of imports and functions) ...

    const getUserName = React.useCallback((id: string | undefined) => {
        if (!id) return null;
        return users[id] || id;
    }, [users]);

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {
            ALL: items.filter(item => !isDataAsset(item)).length,
            AVAILABLE: 0,
            CHECKED_OUT: 0,
            PENDING_VERIFICATION: 0,
            NEEDS_ATTENTION: 0,
            MAINTENANCE: 0,
            DAMAGED: 0,
            LOST: 0,
        };
        items.forEach(item => {
            if (isDataAsset(item)) return;
            if (counts[item.status] !== undefined) {
                counts[item.status]++;
            }
            if (['MAINTENANCE', 'DAMAGED', 'LOST'].includes(item.status) || hasEquipmentIssue(item)) {
                counts.NEEDS_ATTENTION++;
            }
        });
        return counts;
    }, [items]);

    const locationOptions = useMemo(() => {
        const set = new Set<string>();
        items.forEach(i => {
            if (!isDataAsset(i) && i.location && i.location.trim()) {
                set.add(i.location.trim());
            }
        });
        return Array.from(set).sort();
    }, [items]);

    const locationCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        items.forEach(it => {
            if (!isDataAsset(it)) {
                const loc = (it.location || '').trim();
                if (loc) counts[loc] = (counts[loc] || 0) + 1;
                else counts['__UNASSIGNED__'] = (counts['__UNASSIGNED__'] || 0) + 1;
            }
        });
        return counts;
    }, [items]);

    const assigneeCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        items.forEach(it => {
            if (!isDataAsset(it) && it.status !== 'AVAILABLE' && it.assignedTo) {
                counts[it.assignedTo] = (counts[it.assignedTo] || 0) + 1;
            }
        });
        return counts;
    }, [items]);

    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        items.forEach(it => {
            if (!isDataAsset(it) && it.category && it.category.trim()) {
                const cat = it.category.trim();
                counts[cat] = (counts[cat] || 0) + 1;
            }
        });
        return counts;
    }, [items]);

    const assigneeOptions = useMemo(() => {
        return usersList
            .map(u => ({ id: u.id, name: u.name || u.email || 'Unknown' }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [usersList]);

    const ALL_INDIVIDUAL_STATUSES: InventoryStatusFilter[] = [
        'AVAILABLE',
        'CHECKED_OUT',
        'PENDING_VERIFICATION',
        'NEEDS_ATTENTION',
        'MAINTENANCE',
        'DAMAGED',
        'LOST',
    ];

    const isAllStatusesSelected = statusFilter.includes('ALL') || statusFilter.length === 0 || statusFilter.length === ALL_INDIVIDUAL_STATUSES.length;
    const isStatusFiltered = !isAllStatusesSelected;
    const isCategoryFiltered = categoryFilter.length > 0;
    const isAssigneeFiltered = assigneeFilter !== 'ALL';
    const isLocationFiltered = locationFilter !== 'ALL';
    const isBrandFiltered = brandFilter.length > 0;
    const isSizeFiltered = sizeFilter.length > 0;
    const hasAnyFilterActive = isStatusFiltered || isCategoryFiltered || isAssigneeFiltered || isLocationFiltered || isBrandFiltered || isSizeFiltered || !!search.trim();

    const filteredItems = useMemo(() => {
        // This page is the GEAR catalogue. The data team's items (cards, drives, laptops,
        // readers) live on /data-assets instead, so the two teams never wade through each
        // other's kit. Both still go out through the same checkout.
        let result = items.filter(item => !isDataAsset(item));

        // NOTE: Department filtering is already done at the Supabase query level in useEquipment().
        if (search.trim()) {
            const normalize = (str: string) => str.toLowerCase().replace(/[\s\-_]/g, '');
            const tokens: string[] = search.trim().split(/\s+/).map(normalize).filter(Boolean);
            result = result.filter(item => {
                const hay = normalize(
                    [
                        item.name, 
                        item.category, 
                        item.barcode, 
                        item.serialNumber, 
                        item.location,
                        item.metadata?.model, 
                        item.metadata?.brand, 
                        item.metadata?.size, 
                        item.metadata?.endA, 
                        item.metadata?.endB,
                        getUserName(item.assignedTo)
                    ]
                        .filter(Boolean)
                        .join(' ')
                );
                return tokens.every((t: string) => hay.includes(t));
            });
        }

        if (isStatusFiltered) {
            result = result.filter(item => {
                const isNeedsAttention = ['MAINTENANCE', 'DAMAGED', 'LOST'].includes(item.status) || hasEquipmentIssue(item);
                if (statusFilter.includes('NEEDS_ATTENTION') && isNeedsAttention) return true;
                return statusFilter.includes(item.status as InventoryStatusFilter);
            });
        }

        if (categoryFilter.length > 0) {
            const catSet = new Set(categoryFilter.map(c => c.trim().toLowerCase()));
            result = result.filter(item => catSet.has((item.category || '').trim().toLowerCase()));
        }

        if (assigneeFilter !== 'ALL') {
            if (assigneeFilter === 'UNASSIGNED') {
                result = result.filter(item => !item.assignedTo || item.status === 'AVAILABLE');
            } else {
                result = result.filter(item => item.assignedTo === assigneeFilter && item.status !== 'AVAILABLE');
            }
        }

        if (locationFilter !== 'ALL') {
            if (locationFilter === 'UNASSIGNED') {
                result = result.filter(item => !item.location || item.location.trim() === '');
            } else {
                result = result.filter(item => (item.location || '').trim().toLowerCase() === locationFilter.trim().toLowerCase());
            }
        }

        if (brandFilter.length > 0) {
            result = result.filter(item => brandFilter.includes(normalizeCat(item.metadata?.brand || '')));
        }

        if (sizeFilter.length > 0) {
            result = result.filter(item => sizeFilter.includes(normalizeCat(item.metadata?.size || '')));
        }

        if (endFilter.length > 0) {
            // Match items where EITHER connector end is a selected end.
            result = result.filter(item => {
                const a = normalizeCat(item.metadata?.endA || '');
                const b = normalizeCat(item.metadata?.endB || '');
                return endFilter.includes(a) || endFilter.includes(b);
            });
        }

        return result;
    }, [items, search, statusFilter, categoryFilter, assigneeFilter, locationFilter, brandFilter, sizeFilter, endFilter, getUserName]);

    // Sorted items for list & grid views
    const sortedItems = useMemo(() => {
        return [...filteredItems].sort((a, b) => {
            let aValue = '';
            let bValue = '';

            switch (sortField) {
                case 'name':
                    aValue = a.name || '';
                    bValue = b.name || '';
                    break;
                case 'barcode':
                    aValue = a.barcode || '';
                    bValue = b.barcode || '';
                    break;
                case 'serialNumber':
                    aValue = a.serialNumber || '';
                    bValue = b.serialNumber || '';
                    break;
                case 'category':
                    aValue = a.category || '';
                    bValue = b.category || '';
                    break;
                case 'status':
                    aValue = a.status || '';
                    bValue = b.status || '';
                    break;
                case 'location':
                    aValue = a.location || '';
                    bValue = b.location || '';
                    break;
                case 'assignedToName':
                    aValue = getUserName(a.assignedTo) || '';
                    bValue = getUserName(b.assignedTo) || '';
                    break;
                case 'brand':
                    aValue = a.metadata?.brand || '';
                    bValue = b.metadata?.brand || '';
                    break;
                case 'model':
                    aValue = a.metadata?.model || '';
                    bValue = b.metadata?.model || '';
                    break;
                case 'createdAt':
                    const timeA = new Date(a.createdAt || a.lastActivity || 0).getTime();
                    const timeB = new Date(b.createdAt || b.lastActivity || 0).getTime();
                    return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
                default:
                    aValue = ((a as any)[sortField] ?? '').toString();
                    bValue = ((b as any)[sortField] ?? '').toString();
            }

            const cmp = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' });
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [filteredItems, sortField, sortDirection, getUserName]);

    // Pagination calculations
    const totalItems = sortedItems.length;
    const totalPages = pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(totalItems / (pageSize as number)));

    // Clamp current page if total pages decrease
    useEffect(() => {
        if (equipmentLoading || totalItems === 0) return;
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [totalPages, currentPage, equipmentLoading, totalItems]);

    // Ensure the page containing flash item is active
    useEffect(() => {
        const targetBarcode = flashBarcode || (typeof window !== 'undefined' ? sessionStorage.getItem('inventoryFlash') : null);
        if (!targetBarcode || sortedItems.length === 0 || pageSize === 'ALL') return;

        const targetIndex = sortedItems.findIndex(i => i.barcode === targetBarcode);
        if (targetIndex !== -1) {
            const pageForItem = Math.floor(targetIndex / (pageSize as number)) + 1;
            if (currentPage !== pageForItem) {
                setCurrentPage(pageForItem);
            }
        }
    }, [flashBarcode, sortedItems, pageSize, currentPage]);

    const paginatedItems = useMemo(() => {
        if (pageSize === 'ALL') return sortedItems;
        const start = (currentPage - 1) * (pageSize as number);
        return sortedItems.slice(start, start + (pageSize as number));
    }, [sortedItems, currentPage, pageSize]);

    const fromIndex = totalItems === 0 ? 0 : pageSize === 'ALL' ? 1 : (currentPage - 1) * (pageSize as number) + 1;
    const toIndex = pageSize === 'ALL' ? totalItems : Math.min(currentPage * (pageSize as number), totalItems);

    const handlePageChange = (newPage: number) => {
        const target = Math.max(1, Math.min(newPage, totalPages));
        setCurrentPage(target);
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('inventoryCurrentPage', String(target));
            const scroller = document.querySelector('.inventory-table-scroll') || document.querySelector('.inventory-card-scroll');
            if (scroller) scroller.scrollTop = 0;
        }
    };

    const toggleStatusFilter = (status: InventoryStatusFilter) => {
        if (status === 'ALL') {
            setStatusFilter(['ALL']);
            setCurrentPage(1);
            return;
        }
        setStatusFilter(prev => {
            const isAll = prev.includes('ALL') || prev.length === 0 || prev.length === ALL_INDIVIDUAL_STATUSES.length;
            if (isAll) {
                // If previously all, selecting a status selects ONLY that status
                return [status];
            }
            const exists = prev.includes(status);
            let next: InventoryStatusFilter[];
            if (exists) {
                next = prev.filter(s => s !== status);
            } else {
                next = [...prev, status];
            }
            if (next.length === 0 || next.length === ALL_INDIVIDUAL_STATUSES.length) {
                return ['ALL'];
            }
            return next;
        });
        setCurrentPage(1);
    };

    const selectAllStatuses = () => {
        setStatusFilter(['ALL']);
        setCurrentPage(1);
    };

    const deselectAllStatuses = () => {
        setStatusFilter(['ALL']);
        setCurrentPage(1);
    };

    const resetAllFilters = () => {
        setStatusFilter(['ALL']);
        setCategoryFilter([]);
        setAssigneeFilter('ALL');
        setLocationFilter('ALL');
        setBrandFilter([]);
        setSizeFilter([]);
        setEndFilter([]);
        setSearch('');
        setCurrentPage(1);
    };

    const toggleFilterMenu = (type: 'status' | 'category' | 'assignee' | 'location', e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (filterAnchor?.type === type) {
            setFilterAnchor(null);
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const popoverWidth = type === 'status' || type === 'category' || type === 'assignee' ? 280 : 240;
            // Center the popover under the trigger button, clamped within viewport margins
            let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
            if (left + popoverWidth > window.innerWidth - 16) {
                left = window.innerWidth - popoverWidth - 16;
            }
            if (left < 16) {
                left = 16;
            }
            let top = rect.bottom + 6;
            const estimatedHeight = 360;
            if (top + estimatedHeight > window.innerHeight - 16 && rect.top > estimatedHeight) {
                top = Math.max(16, rect.top - estimatedHeight - 6);
            }
            setFilterAnchor({
                top: Math.max(16, top),
                left: Math.max(16, left),
                type,
            });
        }
    };

    // Build deduped {value,label} options for a facet, keyed by normalized value.
    const buildOptions = (pick: (i: Equipment) => string | undefined) => {
        const map = new Map<string, string>();
        for (const it of items) {
            const raw = (pick(it) || '').trim().replace(/\s+/g, ' ');
            if (!raw) continue;
            const key = raw.toLowerCase();
            if (!map.has(key)) map.set(key, raw);
        }
        return Array.from(map.entries())
            .map(([key, label]) => ({ value: label, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    };
    // Category / Brand / Size options for the filters (deduped).
    const categoryOptions = useMemo(() => buildOptions(i => i.category), [items]);
    const brandOptions = useMemo(() => buildOptions(i => i.metadata?.brand), [items]);
    const sizeOptions = useMemo(() => {
        const opts = buildOptions(i => i.metadata?.size);
        // Add a "No size" bucket if any item lacks a size.
        const hasNone = items.some(i => !(i.metadata?.size || '').trim());
        return hasNone ? [...opts, { value: '__none__', label: 'No size' }] : opts;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);
    // Distinct connector ends across BOTH ends (deduped, normalized key).
    const endOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const it of items) {
            for (const raw of [it.metadata?.endA, it.metadata?.endB]) {
                const v = (raw || '').trim().replace(/\s+/g, ' ');
                if (!v) continue;
                const key = v.toLowerCase();
                if (!map.has(key)) map.set(key, v);
            }
        }
        return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    }, [items]);

    const getStatusVariant = (status: EquipmentStatus) => {
        switch (status) {
            case 'AVAILABLE': return 'success';
            case 'CHECKED_OUT': return 'orange';
            case 'PENDING_VERIFICATION': return 'warning';
            case 'DAMAGED': return 'destructive';
            case 'LOST': return 'destructive';
            case 'MAINTENANCE': return 'destructive';
            default: return 'default';
        }
    };

    const getDisplayStatus = (item: Equipment) => {
        if (item.status === 'AVAILABLE' && hasEquipmentIssue(item)) return 'Issue';
        if (item.status === 'PENDING_VERIFICATION') return 'Pending';
        return item.status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    };

    const getDisplayStatusVariant = (item: Equipment) => {
        if (item.status === 'AVAILABLE' && hasEquipmentIssue(item)) return 'warning';
        return getStatusVariant(item.status);
    };

    const handleSort = (field: InventorySortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortIndicator = ({ field }: { field: InventorySortField }) => {
        if (sortField !== field) {
            return <ArrowUpDown size={11} className="text-gray-400 opacity-40 shrink-0 ml-1" />;
        }
        return sortDirection === 'asc' 
            ? <ArrowUp size={11} className="text-primary shrink-0 ml-1" /> 
            : <ArrowDown size={11} className="text-primary shrink-0 ml-1" />;
    };

    const handlePrintQR = async (e: React.MouseEvent, item: Equipment) => {
        e.preventDefault();
        e.stopPropagation();
        if (!item.barcode || !item.barcode.trim()) {
            showToast('This item has no barcode to generate a QR code', 'error');
            return;
        }
        try {
            const qrModule = await import('qrcode');
            const QRCode = qrModule.default || qrModule;
            const pdfModule = await import('jspdf');
            const jsPDF = pdfModule.jsPDF || pdfModule.default;

            if (!jsPDF) throw new Error('jsPDF not loaded');

            const qrUrl = await QRCode.toDataURL(item.barcode, {
                width: 512,
                margin: 4,
                errorCorrectionLevel: 'H'
            });

            const pdf = new jsPDF({ orientation: 'landscape', format: [100, 60], unit: 'mm', compress: true });

            pdf.setFontSize(14);
            pdf.text(item.name.substring(0, 30), 5, 8);

            pdf.addImage(qrUrl, 'PNG', 29, 12, 42, 42);

            pdf.setFontSize(10);
            pdf.text(item.barcode, 50, 56, { align: 'center' });

            downloadFile(pdf.output('blob'), `${item.barcode}_QR.pdf`, 'application/pdf');
        } catch (err) {
            console.error('QR Gen Failed', err);
            alert('Failed to generate PDF');
        }
    };

    const toggleSelect = (e: React.MouseEvent | React.ChangeEvent, itemId: string) => {
        e.stopPropagation();
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        const currentBatch = pageSize === 'ALL' ? sortedItems : paginatedItems;
        const allBatchSelected = currentBatch.length > 0 && currentBatch.every(i => selectedItems.has(i.id));
        if (allBatchSelected) {
            const next = new Set(selectedItems);
            currentBatch.forEach(i => next.delete(i.id));
            setSelectedItems(next);
        } else {
            const next = new Set(selectedItems);
            currentBatch.forEach(i => next.add(i.id));
            setSelectedItems(next);
        }
    };

    const selectAllFiltered = () => {
        setSelectedItems(new Set(filteredItems.map(item => item.id)));
    };

    const clearAllSelection = () => {
        setSelectedItems(new Set());
    };



    const handleBulkDelete = async () => {
        if (selectedItems.size === 0 || isActionLoading) return;

        // Custodian boundary: the data team own their items, equipment managers own the
        // gear. Anything the user can't manage is left alone rather than failing the batch.
        const deletable = items.filter(i => selectedItems.has(i.id) && canManageItem(user, i));
        const skipped = selectedItems.size - deletable.length;
        if (deletable.length === 0) {
            showToast("You can't delete the selected items", 'error');
            return;
        }

        const isConfirmed = await confirm({
            title: `Delete Selected Item${deletable.length !== 1 ? 's' : ''}?`,
            message: `Are you sure you want to delete ${deletable.length} item${deletable.length !== 1 ? 's' : ''}? This action cannot be undone.`
                + (skipped > 0 ? `\n\n${skipped} item${skipped === 1 ? '' : 's'} will be skipped — they belong to another team.` : ''),
            confirmLabel: 'Delete Forever',
            variant: 'danger'
        });

        if (!isConfirmed) return;

        setIsActionLoading(true);
        try {
            // Log before deleting: afterwards the row is gone and there's nothing left to
            // describe. Deletions were previously silent, so an item could vanish with no
            // record of who removed it — the one action most in need of an audit trail.
            // newValue keeps a snapshot, since entity_id will point at a row that no longer exists.
            if (user) {
                await Promise.all(deletable.map(item => storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'DELETE',
                    entityId: item.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Deleted "${item.name}" (${item.barcode})${item.serialNumber ? `, S/N ${item.serialNumber}` : ''} from ${item.category}`,
                    oldValue: {
                        name: item.name,
                        category: item.category,
                        barcode: item.barcode,
                        serialNumber: item.serialNumber,
                        status: item.status,
                        location: item.location,
                        metadata: item.metadata,
                    },
                    departmentId: item.departmentId || undefined,
                })));
            }

            await deleteEquipment(deletable.map(i => i.id));
            showToast(
                `Successfully deleted ${deletable.length} item${deletable.length === 1 ? '' : 's'}`
                + (skipped > 0 ? ` (${skipped} skipped)` : ''),
                'success'
            );
            setSelectedItems(new Set());
        } catch (error) {
            console.error('Delete failed:', error);
            showToast('Failed to delete items', 'error');
        } finally {
            setIsActionLoading(false);
        }
    };

    // ---- Bulk custodian tagging ------------------------------------------------
    // How the initial cards/drives/laptops get moved into the data team's pool, and how
    // an item moves back. Only the data team and admins can reassign custody.
    const [custodianApplying, setCustodianApplying] = useState(false);
    const setSelectedCustodian = async (custodian: 'DATA' | null) => {
        if (selectedItems.size === 0 || custodianApplying) return;
        if (!canManageDataAssets(user)) {
            showToast('Only the data team can change custody', 'error');
            return;
        }
        const targets = items.filter(i => selectedItems.has(i.id));
        setCustodianApplying(true);
        let err = false;
        for (const item of targets) {
            try {
                const metadata = { ...(item.metadata || {}) };
                if (custodian) metadata.custodian = custodian; else delete metadata.custodian;
                await updateEquipment({ id: item.id, updates: { metadata } });
                await logEquipmentEdit(item, custodian
                    ? `Moved "${item.name}" (${item.barcode}) into the data team's items`
                    : `Moved "${item.name}" (${item.barcode}) back to the gear pool`);
            } catch (e) {
                console.error('Custodian update failed:', e);
                err = true;
            }
        }
        setCustodianApplying(false);
        showToast(
            err ? 'Some items could not be updated'
                : `${targets.length} item${targets.length === 1 ? '' : 's'} ${custodian ? 'moved to the data team' : 'moved back to gear'}`,
            err ? 'error' : 'success'
        );
        setSelectedItems(new Set());
        refresh();
    };

    // ---- Find & Replace across selected (or filtered) items -------------------
    // Operates on the selection if any, else the whole filtered list.
    // Custodian boundary applies to every bulk write that runs off this list
    // (find & replace, barcode regeneration, connector normalisation).
    const frTargets = useMemo(
        () => (selectedItems.size > 0 ? items.filter(i => selectedItems.has(i.id)) : filteredItems)
            .filter(i => canManageItem(user, i)),
        [selectedItems, items, filteredItems, user]
    );
    const frFieldValue = (item: Equipment, f: 'name' | 'barcode' | 'category' | 'model' | 'size') =>
        (f === 'model' || f === 'size') ? (item.metadata?.[f] || '') : (((item as unknown as Record<string, unknown>)[f] as string) || '');
    const frApplyStr = (val: string) => {
        if (!frFind) return val;
        if (frCase) return val.split(frFind).join(frReplace);
        const re = new RegExp(frFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        return val.replace(re, frReplace);
    };
    const frChanges = useMemo(() => {
        if (!frFind) return [] as { item: Equipment; upd: Record<string, string>; meta: Record<string, string> }[];
        const fields = frField === 'all' ? (['name', 'barcode', 'category', 'model', 'size'] as const) : [frField];
        const out: { item: Equipment; upd: Record<string, string>; meta: Record<string, string> }[] = [];
        for (const item of frTargets) {
            const upd: Record<string, string> = {};
            const meta: Record<string, string> = {};
            for (const f of fields) {
                const cur = frFieldValue(item, f);
                if (!cur) continue;
                const next = frApplyStr(cur);
                if (next !== cur) {
                    if (f === 'model' || f === 'size') meta[f] = next; else upd[f] = next;
                }
            }
            if (Object.keys(upd).length || Object.keys(meta).length) out.push({ item, upd, meta });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frFind, frReplace, frField, frCase, frTargets]);

    // Write an EDIT entry to the activity log for an equipment change.
    const logEquipmentEdit = async (item: Equipment, details: string) => {
        if (!user) return;
        try {
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: item.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details,
                departmentId: item.departmentId || undefined,
            });
        } catch (e) {
            console.error('Failed to write edit log:', e);
        }
    };

    const runFindReplace = async () => {
        if (frChanges.length === 0) return;
        setFrApplying(true);
        let err = false;
        for (const { item, upd, meta } of frChanges) {
            try {
                const updates: Partial<Equipment> = { ...upd } as Partial<Equipment>;
                if (Object.keys(meta).length) updates.metadata = { ...(item.metadata || {}), ...meta };
                await updateEquipment({ id: item.id, updates });
                const parts = [
                    ...Object.entries(upd).map(([f, to]) => `${f} "${frFieldValue(item, f as 'name' | 'barcode' | 'category')}"→"${to}"`),
                    ...Object.entries(meta).map(([f, to]) => `${f} "${frFieldValue(item, f as 'model' | 'size')}"→"${to}"`),
                ];
                await logEquipmentEdit(item, `Find & replace on "${item.name}" (${item.barcode}): ${parts.join(', ')}`);
            } catch (e) {
                console.error('Find & replace update failed:', e);
                err = true;
            }
        }
        setFrApplying(false);
        showToast(err ? 'Some updates failed' : `Replaced in ${frChanges.length} item${frChanges.length !== 1 ? 's' : ''}`, err ? 'error' : 'success');
        setFrOpen(false);
        setFrFind('');
        setFrReplace('');
        refresh();
    };

    // ---- Bulk barcode generation (standard scheme) ----------------------------
    // Regenerate each target's barcode as <CATEGORY_PREFIX>-<MODEL_CODE>-<№>, the same
    // rule Add/Import use. Numbering continues after the highest existing number for
    // that base among items NOT being regenerated (collision-safe), then increments
    // per item within the batch.
    const openBarcodeGen = () => setBcOpen(true);

    // ---- Bulk rename: compose names from brand + model + size + category ------
    // Most items were entered with the name set to just the category ("Battery" in category
    // "Battery"), which identifies nothing. Scope comes from frTargets — the selected rows, or
    // the current filtered list — exactly like the other bulk tools, so the category filter
    // and row checkboxes already on the page are the way to narrow it.
    const [rnOpen, setRnOpen] = useState(false);
    const [rnApplying, setRnApplying] = useState(false);
    const [rnSkipped, setRnSkipped] = useState<Set<string>>(new Set());

    const rnCandidates = useMemo(() => {
        return frTargets
            // Connectors build their own names from their ends — never overwrite those.
            .filter(i => !isRenameExcluded(i))
            .map(item => ({
                item,
                proposed: proposedEquipmentName(item),
                safe: isSafeToRename(item),
            }))
            // Drop no-ops, and drop anything where the existing name already says more than
            // the proposal would — those are never an improvement.
            .filter(({ item, proposed }) => proposed
                && proposed !== item.name.trim()
                && !renameLosesDetail(item))
            .sort((a, b) => Number(b.safe) - Number(a.safe)
                || a.item.name.localeCompare(b.item.name, undefined, { numeric: true }));
    }, [frTargets]);

    // Safe rewrites start ticked; anything that looks hand-written starts unticked.
    const rnSelected = useMemo(
        () => rnCandidates.filter(c => (c.safe ? !rnSkipped.has(c.item.id) : rnSkipped.has(c.item.id))),
        [rnCandidates, rnSkipped]
    );

    const openRename = () => {
        setRnSkipped(new Set());
        setRnOpen(true);
    };

    const toggleRenameItem = (id: string) => setRnSkipped(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const runRename = async () => {
        if (rnSelected.length === 0) return;
        setRnApplying(true);
        let err = false, changed = 0;
        for (const { item, proposed } of rnSelected) {
            try {
                await updateEquipment({ id: item.id, updates: { name: proposed } });
                await logEquipmentEdit(item, `Renamed "${item.name}" → "${proposed}" (${item.barcode})`);
                changed++;
            } catch (e) {
                console.error('Rename failed:', e);
                err = true;
            }
        }
        setRnApplying(false);
        showToast(
            err ? 'Some items could not be renamed' : `Renamed ${changed} item${changed !== 1 ? 's' : ''}`,
            err ? 'error' : 'success'
        );
        setRnOpen(false);
        refresh();
    };

    const bcChanges = useMemo(() => {
        const changingIds = new Set(frTargets.map(i => i.id));
        const outside = items.filter(i => !changingIds.has(i.id));
        const nextByBase = new Map<string, number>(); // base -> next number to assign
        return frTargets.map(item => {
            const base = getEquipmentBarcodeBase(item.category, item.metadata?.model || item.serialNumber || 'GEN');
            const start = nextByBase.has(base)
                ? nextByBase.get(base)!
                : getMaxBarcodeNumber(base, outside) + 1;
            nextByBase.set(base, start + 1);
            return { item, barcode: `${base}-${start}` };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frTargets, items]);

    const runBarcodeGen = async () => {
        if (bcChanges.length === 0) return;
        setBcApplying(true);
        let err = false, changed = 0;
        for (const { item, barcode } of bcChanges) {
            if (barcode === item.barcode) continue;
            try {
                await updateEquipment({ id: item.id, updates: { barcode } });
                await logEquipmentEdit(item, `Generated barcode for "${item.name}": "${item.barcode}"→"${barcode}"`);
                changed++;
            } catch (e) {
                console.error('Barcode generation failed:', e);
                err = true;
            }
        }
        setBcApplying(false);
        showToast(err ? 'Some updates failed' : `Regenerated ${changed} barcode${changed !== 1 ? 's' : ''}`, err ? 'error' : 'success');
        setBcOpen(false);
        refresh();
    };

    // ---- Normalize connectors -------------------------------------------------
    // Connector targets (category is Connector/Cable/Adapter) grouped by current name.
    const ncGroups = useMemo(() => {
        const conns = frTargets.filter(i => isConnectorCategory(i.category));
        const map = new Map<string, Equipment[]>();
        for (const it of conns) {
            const key = (it.name || '').trim() || '(no name)';
            (map.get(key) || map.set(key, []).get(key)!).push(it);
        }
        return Array.from(map.entries()).map(([name, list]) => ({ name, list })).sort((a, b) => a.name.localeCompare(b.name));
    }, [frTargets]);
    const ncConnectorCount = useMemo(() => ncGroups.reduce((n, g) => n + g.list.length, 0), [ncGroups]);

    const openNormalize = () => {
        const seed: Record<string, ParsedConnector> = {};
        for (const g of ncGroups) seed[g.name] = parseConnectorName(g.name);
        setNcEdits(seed);
        setNcOpen(true);
    };
    const setNcEdit = (group: string, patch: Partial<ParsedConnector>) =>
        setNcEdits(prev => ({ ...prev, [group]: { ...prev[group], ...patch } }));

    const runNormalize = async () => {
        setNcApplying(true);
        let err = false, changed = 0;
        for (const g of ncGroups) {
            const e = ncEdits[g.name];
            if (!e) continue;
            const newName = buildConnectorName(e.endA, e.endAGender, e.endB, e.endBGender);
            const code = buildConnectorCode(e.endA, e.endAGender, e.endB, e.endBGender);
            if (!newName) continue; // skip groups the user cleared out
            for (const item of g.list) {
                try {
                    await updateEquipment({
                        id: item.id,
                        updates: {
                            name: newName,
                            category: (item.category || '').trim(),
                            metadata: {
                                ...(item.metadata || {}),
                                endA: e.endA.trim() || undefined,
                                endAGender: e.endAGender || undefined,
                                endB: e.endB.trim() || undefined,
                                endBGender: e.endBGender || undefined,
                                size: e.size.trim() || item.metadata?.size || undefined,
                                model: code || item.metadata?.model,
                            },
                        },
                    });
                    await logEquipmentEdit(item, `Normalized connector "${item.name}" → "${newName}" (code ${code}${e.size ? `, size ${e.size}` : ''})`);
                    changed++;
                } catch (ex) {
                    console.error('Normalize failed:', ex);
                    err = true;
                }
            }
        }
        setNcApplying(false);
        showToast(err ? 'Some updates failed' : `Normalized ${changed} connector${changed !== 1 ? 's' : ''}. Now Regenerate barcodes.`, err ? 'error' : 'success');
        setNcOpen(false);
        refresh();
    };

    const handleBulkDownloadQR = async (cfg: LabelConfig) => {
        if (isGeneratingQR) return;

        if (selectedItems.size === 0) {
            alert('Please select at least one item');
            return;
        }
        if (!cfg.showQr && !cfg.showName && !cfg.showSerial) {
            showToast('Pick at least one thing to print', 'error');
            return;
        }

        setIsGeneratingQR(true);
        try {
            const qrModule = await import('qrcode');
            const QRCode = qrModule.default || qrModule;
            const pdfModule = await import('jspdf');
            const jsPDF = pdfModule.jsPDF || pdfModule.default;
            if (!jsPDF) throw new Error('jsPDF not loaded');

            // compress: true keeps the file small (raw QR pixels would balloon it to
            // hundreds of MB and OOM the tab). See earlier fix.
            const pdf = new jsPDF({ orientation: 'portrait', format: cfg.pageSize, unit: 'mm', compress: true });

            // Print in the SAME order the list is currently showing (category sort, etc.), so
            // the sheet follows the on-screen order. Selected items outside the current
            // filter (rare) are appended at the end rather than dropped.
            const inView = filteredItems.filter(item => selectedItems.has(item.id));
            const inViewIds = new Set(inView.map(item => item.id));
            const leftovers = items.filter(item => selectedItems.has(item.id) && !inViewIds.has(item.id));
            const allSelected = [...inView, ...leftovers];
            const selectedItemsArray = allSelected.filter(item => item.barcode && item.barcode.trim());
            const skippedCount = allSelected.length - selectedItemsArray.length;
            if (selectedItemsArray.length === 0) {
                showToast('None of the selected items have a barcode to generate QR codes', 'error');
                return;
            }

            // Shared geometry + one uniform font (same maths the live preview uses).
            const L = computeQrLayout(cfg);
            const { cell, cols, rows, originX, originY, qrSize, topH, bottomH, leftW, rightW, contentW, contentH, lineH, gapLines } = L;
            const gap = cfg.gap;
            const cellWidth = cell, cellHeight = cell, qrW = qrSize, qrH = qrSize;
            const measure = (text: string, bold: boolean, fs: number) => {
                pdf.setFont('helvetica', bold ? 'bold' : 'normal');
                pdf.setFontSize(fs);
                return pdf.getTextWidth(text);
            };

            const itemsPerPage = cols * rows;
            const qrCache = new Map<string, string>();

            for (let i = 0; i < selectedItemsArray.length; i++) {
                const item = selectedItemsArray[i];
                const positionOnPage = i % itemsPerPage;
                const row = Math.floor(positionOnPage / cols);
                const col = positionOnPage % cols;
                if (positionOnPage === 0 && i > 0) pdf.addPage();

                const cellX = originX + col * cell;
                const cellY = originY + row * cell;

                if (cfg.cutGuides) {
                    pdf.setDrawColor(205);
                    pdf.setLineWidth(0.1);
                    pdf.rect(cellX, cellY, cell, cell);
                }

                // Per-item text only; every layout constant is precomputed above so the
                // grid, QR size and font size are identical across all labels.
                const slots: { text: string; pos: LabelPos; bold: boolean }[] = [];
                if (cfg.showName) slots.push({ text: item.barcode, pos: cfg.namePos, bold: cfg.boldName });
                if (cfg.showSerial) slots.push({ text: item.serialNumber ? maskSerialText(item.serialNumber, cfg.maskSerial) : '', pos: cfg.serialPos, bold: false });
                const top = slots.filter(t => t.pos === 'top');
                const bottom = slots.filter(t => t.pos === 'bottom');
                const left = slots.filter(t => t.pos === 'left');
                const right = slots.filter(t => t.pos === 'right');

                const blockX = cellX + (cellWidth - contentW) / 2;
                const blockY = cellY + (cellHeight - contentH) / 2;
                const qrX = blockX + leftW + (leftW ? gap : 0);
                const qrY = blockY + topH + (topH ? gap : 0);
                const qrCenterX = qrX + qrW / 2;
                const qrMidY = qrY + qrH / 2;

                if (cfg.showQr) {
                    let qrUrl = qrCache.get(item.barcode);
                    if (!qrUrl) {
                        qrUrl = await QRCode.toDataURL(item.barcode, { width: 256, margin: cfg.qrMargin, errorCorrectionLevel: 'H' });
                        qrCache.set(item.barcode, qrUrl);
                    }
                    pdf.addImage(qrUrl, 'PNG', qrX, qrY, qrSize, qrSize);
                }

                pdf.setTextColor(20); // solid black
                // Each line uses the standard font size, shrunk only if it overflows its slot
                // (auto-fit). Text sits `gap` from the QR edge on every side for equal spacing.
                const prep = (t: { text: string; pos: LabelPos; bold: boolean }) => {
                    pdf.setFont('helvetica', t.bold ? 'bold' : 'normal');
                    const fs = fitFontFor(t.text, t.pos, t.bold, cfg, L, measure);
                    pdf.setFont('helvetica', t.bold ? 'bold' : 'normal');
                    pdf.setFontSize(fs);
                    return fs * 0.3528 * 0.72; // cap height in mm at this size
                };
                // TOP: glyph bottom ≈ gap above the QR.
                top.forEach((t, k) => {
                    if (!t.text) return;
                    prep(t);
                    pdf.text(t.text, qrCenterX, qrY - gap - k * lineH, { align: 'center' });
                });
                // BOTTOM: glyph top ≈ gap below the QR.
                bottom.forEach((t, k) => {
                    if (!t.text) return;
                    const capH = prep(t);
                    pdf.text(t.text, qrCenterX, qrY + qrH + gap + capH + k * lineH, { align: 'center' });
                });
                // LEFT (rotated): glyph right edge ≈ gap left of the QR.
                left.forEach((t, k) => {
                    if (!t.text) return;
                    prep(t);
                    const tw = pdf.getTextWidth(t.text);
                    pdf.text(t.text, qrX - gap - k * lineH, qrMidY + tw / 2, { angle: 90 });
                });
                // RIGHT (rotated): glyph left edge ≈ gap right of the QR.
                right.forEach((t, k) => {
                    if (!t.text) return;
                    const capH = prep(t);
                    const tw = pdf.getTextWidth(t.text);
                    pdf.text(t.text, qrX + qrW + gap + capH + k * lineH, qrMidY + tw / 2, { angle: 90 });
                });
                pdf.setTextColor(0);
            }

            downloadFile(pdf.output('blob'), `QR_Codes_${cfg.size}_${selectedItemsArray.length}_items.pdf`, 'application/pdf');
            showToast(
                skippedCount > 0
                    ? `Generated ${selectedItemsArray.length} QR codes (${skippedCount} skipped — no barcode)`
                    : `Generated ${selectedItemsArray.length} QR codes`,
                skippedCount > 0 ? 'info' : 'success'
            );
            setSelectedItems(new Set());
        } catch (err) {
            console.error('Bulk QR Gen Failed', err);
            showToast('Failed to generate QR codes', 'error');
        } finally {
            setIsGeneratingQR(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100dvh-62px)] 2xl:h-[calc(100dvh-66px)] max-h-[calc(100dvh-62px)] 2xl:max-h-[calc(100dvh-66px)] w-full overflow-hidden space-y-1.5 animate-fade-in">
            {/* Unified Compact Toolbar: Search + Quick Actions + Filters (Matching Shoots page style) */}
            <div className="shrink-0 rounded-xl p-1.5 sm:p-2 shadow-2xs space-y-1.5 bg-white dark:bg-[#1c1c1e] border border-gray-200/80 dark:border-gray-800">
                {/* Row 1: Search + Quick Tools + View Switcher + Filter Toggle + Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {/* Compact Search Input */}
                        <div className="relative flex-1 min-w-0 max-w-md">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search name, barcode, serial, model…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') openLookupItem(search);
                                }}
                                className="w-full h-8 pl-8 pr-7 text-xs bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                                    title="Clear search"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Scanner Toggle Button */}
                        <button
                            type="button"
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all cursor-pointer ${
                                showInventoryScanner
                                    ? 'border-primary bg-primary text-white shadow-xs'
                                    : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                            onClick={() => setShowInventoryScanner(prev => !prev)}
                            title={showInventoryScanner ? 'Hide scanner' : 'Scan QR code'}
                        >
                            <ScanLine size={15} />
                        </button>
                    </div>

                    {/* View Mode + Filters + Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
                        {/* View Mode Toggle */}
                        <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700 shrink-0">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                                    viewMode === 'grid'
                                        ? 'bg-white dark:bg-[#2c2c2e] text-primary shadow-xs'
                                        : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                                title="Grid View"
                            >
                                <LayoutGrid size={14} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                                    viewMode === 'list'
                                        ? 'bg-white dark:bg-[#2c2c2e] text-primary shadow-xs'
                                        : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                                title="List / Table View"
                            >
                                <List size={14} />
                            </button>
                        </div>

                        {/* Filter Toggle Button with Active Count Badge (Shoots style) */}
                        <button
                            type="button"
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer h-8 shrink-0 ${
                                showFilters || hasAnyFilterActive
                                    ? 'bg-primary/10 text-primary border border-primary/25 font-semibold'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent'
                            }`}
                            title={hasAnyFilterActive ? 'Active filters applied. Click to toggle panel' : 'Filter inventory'}
                        >
                            <Filter size={12} />
                            <span className="hidden sm:inline">Filters</span>
                            {hasAnyFilterActive && (
                                <span className="flex items-center justify-center min-w-[15px] h-[15px] px-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full">
                                    {[
                                        isStatusFiltered,
                                        isCategoryFiltered,
                                        isAssigneeFiltered,
                                        isLocationFiltered,
                                        isBrandFiltered,
                                        isSizeFiltered,
                                        !!search.trim()
                                    ].filter(Boolean).length}
                                </span>
                            )}
                            <ChevronDown size={12} className={`transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Database Cleanup Button */}
                        {(cleanupData.staleAssignments.length > 0 || cleanupData.ghostCheckouts.length > 0) && can('fixData') && (
                            <button
                                onClick={handleCleanupAssignments}
                                className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-lg border border-rose-500/30 flex items-center gap-1 transition-all animate-pulse cursor-pointer h-8 shrink-0"
                                title="Fix inconsistent data in database"
                            >
                                <RefreshCw size={12} />
                                <span>Fix ({cleanupData.staleAssignments.length + cleanupData.ghostCheckouts.length})</span>
                            </button>
                        )}

                        {/* Bulk Import */}
                        <Link
                            href="/inventory/bulk-add"
                            className="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-1 transition-all cursor-pointer h-8 shrink-0"
                            title="Bulk Import Equipment"
                        >
                            <Plus size={12} className="text-gray-500" />
                            <span className="hidden sm:inline">Bulk Import</span>
                            <span className="sm:hidden">Import</span>
                        </Link>

                        {/* Export CSV */}
                        {can('exportCsv') && (
                            <button
                                onClick={() => {
                                    const headers = ['Name', 'Category', 'Barcode', 'Serial Number', 'Status', 'Location', 'Assigned To'];
                                    const rows = sortedItems.map(item => [
                                        `"${item.name.replace(/"/g, '""')}"`,
                                        `"${item.category.replace(/"/g, '""')}"`,
                                        item.barcode,
                                        item.serialNumber || '',
                                        item.status,
                                        `"${(item.location || '').replace(/"/g, '""')}"`,
                                        item.assignedTo ? (users[item.assignedTo] || 'Unknown') : ''
                                    ].join(','));
                                    const csvContent = [headers.join(','), ...rows].join('\n');
                                    downloadFile(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), `inventory_export_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
                                }}
                                className="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-1 transition-all cursor-pointer h-8 shrink-0"
                                title="Export CSV"
                            >
                                <FileText size={12} className="text-gray-500" />
                                <span className="hidden sm:inline">Export</span>
                                <span className="sm:hidden">CSV</span>
                            </button>
                        )}

                        {/* Add Equipment */}
                        {['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role || '') && (
                            <Link
                                href="/inventory/add"
                                className="px-3 py-1 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg shadow-xs flex items-center gap-1 transition-all cursor-pointer h-8 shrink-0"
                                title="Add New Equipment"
                            >
                                <Plus size={12} strokeWidth={2.5} />
                                <span className="hidden xs:inline">New</span>
                            </Link>
                        )}
                    </div>
                </div>

                {/* Row 2: ALWAYS-VISIBLE ACTIVE FILTER CHIPS (When Filter Panel is Collapsed) */}
                {!showFilters && hasAnyFilterActive && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-800/80 animate-in fade-in duration-150">
                        <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 flex items-center gap-1 mr-0.5">
                            <Filter size={11} className="text-primary" />
                            Active:
                        </span>

                        {search.trim() && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 shadow-2xs">
                                <span className="text-gray-400">Search:</span> &ldquo;{search}&rdquo;
                                <button
                                    onClick={() => setSearch('')}
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
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: opt?.color || '#2563eb' }} />
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

                        {categoryFilter.length > 0 && categoryFilter.map(cat => (
                            <span key={cat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary border border-primary/25 shadow-2xs">
                                <span className="opacity-70 font-normal">Category:</span> {cat}
                                <button
                                    onClick={() => {
                                        setCategoryFilter(prev => prev.filter(c => c !== cat));
                                        setCurrentPage(1);
                                    }}
                                    className="hover:text-red-500 ml-0.5 cursor-pointer"
                                    title={`Remove ${cat} filter`}
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        ))}

                        {isAssigneeFiltered && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs">
                                <span className="opacity-70 font-normal">Assigned:</span> {assigneeFilter === 'UNASSIGNED' ? 'Unassigned' : (getUserName(assigneeFilter) || 'User')}
                                <button
                                    onClick={() => {
                                        setAssigneeFilter('ALL');
                                        setCurrentPage(1);
                                    }}
                                    className="hover:text-red-500 ml-0.5 cursor-pointer"
                                    title="Remove assignee filter"
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        )}

                        {isLocationFiltered && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs">
                                <span className="opacity-70 font-normal">Location:</span> {locationFilter === 'UNASSIGNED' ? 'No Location' : locationFilter}
                                <button
                                    onClick={() => {
                                        setLocationFilter('ALL');
                                        setCurrentPage(1);
                                    }}
                                    className="hover:text-red-500 ml-0.5 cursor-pointer"
                                    title="Remove location filter"
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        )}

                        {brandFilter.map(brand => (
                            <span key={brand} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-2xs">
                                <span className="text-gray-400">Brand:</span> {brand}
                                <button
                                    onClick={() => {
                                        setBrandFilter(prev => prev.filter(b => b !== brand));
                                        setCurrentPage(1);
                                    }}
                                    className="hover:text-red-500 ml-0.5 cursor-pointer"
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        ))}

                        {sizeFilter.map(sz => (
                            <span key={sz} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-2xs">
                                <span className="text-gray-400">Size:</span> {sz === '__none__' ? 'No size' : sz}
                                <button
                                    onClick={() => {
                                        setSizeFilter(prev => prev.filter(s => s !== sz));
                                        setCurrentPage(1);
                                    }}
                                    className="hover:text-red-500 ml-0.5 cursor-pointer"
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        ))}

                        <button
                            type="button"
                            onClick={resetAllFilters}
                            className="text-[11px] font-bold text-red-500 hover:text-red-600 hover:underline px-1.5 py-0.5 cursor-pointer transition-colors ml-1"
                            title="Reset all filters"
                        >
                            Reset all
                        </button>
                    </div>
                )}

                {/* Row 2: SLEEK 1-ROW FILTER BAR (When Filter Panel is Expanded) */}
                {showFilters && (
                    <div className="flex items-center gap-1.5 sm:gap-2 pt-1.5 border-t border-gray-100 dark:border-gray-800/80 flex-wrap sm:flex-nowrap overflow-x-auto no-scrollbar animate-in fade-in slide-in-from-top-1 duration-150">
                        {/* 1. Status Multi-Filter Trigger */}
                        <button
                            type="button"
                            data-filter-trigger="status"
                            onClick={(e) => toggleFilterMenu('status', e)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer h-7.5 shadow-2xs shrink-0 ${
                                isStatusFiltered
                                    ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <span className="text-gray-400 dark:text-gray-500 font-normal">Status:</span>
                            <span className="truncate max-w-[110px]">
                                {!isStatusFiltered
                                    ? 'All'
                                    : statusFilter.length === 1
                                    ? (ALL_STATUS_OPTIONS.find(o => o.value === statusFilter[0])?.label || statusFilter[0])
                                    : `${statusFilter.length} active`}
                            </span>
                            <ChevronDown size={11} className="text-gray-400 shrink-0" />
                        </button>

                        {/* 2. Category Filter Trigger */}
                        <button
                            type="button"
                            data-filter-trigger="category"
                            onClick={(e) => toggleFilterMenu('category', e)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer h-7.5 shadow-2xs shrink-0 ${
                                isCategoryFiltered
                                    ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <span className="text-gray-400 dark:text-gray-500 font-normal">Category:</span>
                            <span className="truncate max-w-[110px]">
                                {!isCategoryFiltered
                                    ? 'All'
                                    : categoryFilter.length === 1
                                    ? categoryFilter[0]
                                    : `${categoryFilter.length} active`}
                            </span>
                            <ChevronDown size={11} className="text-gray-400 shrink-0" />
                        </button>

                        {/* 3. Assigned To Filter Trigger */}
                        <button
                            type="button"
                            data-filter-trigger="assignee"
                            onClick={(e) => toggleFilterMenu('assignee', e)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer h-7.5 shadow-2xs shrink-0 ${
                                isAssigneeFiltered
                                    ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <span className="text-gray-400 dark:text-gray-500 font-normal">Assigned:</span>
                            <span className="truncate max-w-[110px]">
                                {assigneeFilter === 'ALL'
                                    ? 'All'
                                    : assigneeFilter === 'UNASSIGNED'
                                    ? 'Unassigned'
                                    : (getUserName(assigneeFilter) || '1 User')}
                            </span>
                            <ChevronDown size={11} className="text-gray-400 shrink-0" />
                        </button>

                        {/* 4. Location Filter */}
                        <div className="relative flex items-center shrink-0">
                            <select
                                value={locationFilter}
                                onChange={(e) => {
                                    setLocationFilter(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className={`h-7.5 pl-2.5 pr-6 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer shadow-2xs appearance-none focus:outline-none focus:ring-1 focus:ring-primary ${
                                    isLocationFiltered
                                        ? 'bg-primary/10 text-primary border-primary/40 font-semibold'
                                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                }`}
                            >
                                <option value="ALL">Location: All</option>
                                <option value="UNASSIGNED">No Location</option>
                                {locationOptions.map(loc => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                            </select>
                            <ChevronDown size={11} className="absolute right-2 text-gray-400 pointer-events-none" />
                        </div>

                        {/* 5. Additional Facet Filters (Brand, Size, Connector End) */}
                        <FacetFilters
                            resultCount={totalItems}
                            groups={[
                                { key: 'brand', label: 'Brand', options: brandOptions, selected: brandFilter, onChange: (val) => { setBrandFilter(val); setCurrentPage(1); } },
                                { key: 'size', label: 'Size', options: sizeOptions, selected: sizeFilter, onChange: (val) => { setSizeFilter(val); setCurrentPage(1); } },
                                { key: 'end', label: 'Connector', options: endOptions, selected: endFilter, onChange: (val) => { setEndFilter(val); setCurrentPage(1); } },
                            ]}
                        />

                        {/* Reset Action */}
                        {hasAnyFilterActive && (
                            <button
                                type="button"
                                onClick={resetAllFilters}
                                className="h-7.5 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 transition-colors cursor-pointer shrink-0"
                                title="Reset all active filters"
                            >
                                <X size={11} />
                                <span>Reset</span>
                            </button>
                        )}

                        {/* Sort Controls (Flush right, Shoots style) */}
                        <div className="flex items-center gap-1 sm:ml-auto shrink-0">
                            <div className="relative flex items-center">
                                <select
                                    value={sortField}
                                    onChange={(e) => setSortField(e.target.value as InventorySortField)}
                                    className="h-7.5 pl-2.5 pr-6 py-1 rounded-lg text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-2xs appearance-none"
                                >
                                    <option value="name">Sort: Name</option>
                                    <option value="category">Sort: Category</option>
                                    <option value="barcode">Sort: Barcode</option>
                                    <option value="serialNumber">Sort: S/N</option>
                                    <option value="status">Sort: Status</option>
                                    <option value="assignedToName">Sort: Assigned To</option>
                                    <option value="location">Sort: Location</option>
                                    <option value="brand">Sort: Brand</option>
                                    <option value="model">Sort: Model</option>
                                    <option value="createdAt">Sort: Added Date</option>
                                </select>
                                <ChevronDown size={11} className="absolute right-2 text-gray-400 pointer-events-none" />
                            </div>
                            <button
                                type="button"
                                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                className="h-7.5 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1 text-xs cursor-pointer shadow-2xs"
                                title={`Sorting ${sortDirection === 'asc' ? 'Ascending' : 'Descending'}. Click to toggle`}
                            >
                                {sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                <span className="font-semibold text-[11px]">{sortDirection === 'asc' ? 'Asc' : 'Desc'}</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Results Count (Fixed & Compact, matching Shoots page) */}
            <div className="shrink-0 flex items-center justify-between px-1 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
                <p>
                    {totalItems === 0 ? (
                        '0 items'
                    ) : (
                        <>
                            Showing <span className="font-semibold text-gray-900 dark:text-white">{fromIndex}–{toIndex}</span> of <span className="font-semibold text-gray-900 dark:text-white">{totalItems}</span> items
                            {totalItems !== items.filter(i => !isDataAsset(i)).length && (
                                <span className="text-gray-400 ml-1"> (filtered from {items.filter(i => !isDataAsset(i)).length})</span>
                            )}
                        </>
                    )}
                </p>
                {totalItems > 0 && pageSize !== 'ALL' && totalPages > 1 && (
                    <p className="text-gray-400">
                        Page {currentPage} of {totalPages}
                    </p>
                )}
            </div>

            {/* Scanner Drawer (if activated) */}
            {showInventoryScanner && (
                <div className="shrink-0 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] p-3 shadow-lg">
                    <div className="mb-2 flex items-center justify-between gap-3 px-1">
                        <div className="min-w-0">
                            <h2 className="text-sm font-bold text-gray-900 dark:text-white">QR Code Scanner</h2>
                            <p className="truncate text-xs text-gray-400">Scan an item barcode to open its details.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowInventoryScanner(false)}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            Close
                        </button>
                    </div>

                    <div className="md:hidden h-[min(60vh,400px)] min-h-[300px] overflow-hidden rounded-xl bg-black">
                        <MobileScanner
                            onScan={handleInventoryScan}
                            onError={(error) => showToast(error, 'error')}
                            onClose={() => setShowInventoryScanner(false)}
                            autoStart={true}
                        />
                    </div>

                    <div className="hidden md:block">
                        <QRScanner
                            onScan={handleInventoryScan}
                            onError={(error) => showToast(error, 'error')}
                            continuous={false}
                            compact
                            autoStart
                        />
                    </div>
                </div>
            )}

            {/* Bulk Actions Banner (When items selected or editing) */}
            {(selectedItems.size > 0 || isBulkEditMode) && (
                <div className="shrink-0 flex items-center justify-between bg-primary/[0.08] dark:bg-primary/[0.15] border border-primary/30 rounded-xl px-3 py-1.5 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="flex items-center justify-center cursor-pointer shrink-0"
                            title={
                                paginatedItems.length > 0 && paginatedItems.every(i => selectedItems.has(i.id))
                                    ? 'Deselect page'
                                    : 'Select page'
                            }
                        >
                            <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                                paginatedItems.length > 0 && paginatedItems.every(i => selectedItems.has(i.id))
                                    ? 'border-primary bg-primary text-white'
                                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                            }`}>
                                {paginatedItems.length > 0 && paginatedItems.every(i => selectedItems.has(i.id)) && (
                                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </span>
                        </button>
                        <span className="text-xs font-semibold text-primary">
                            {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                        </span>
                        {selectedItems.size > 0 && selectedItems.size < totalItems && (
                            <button
                                type="button"
                                onClick={selectAllFiltered}
                                className="text-[11px] font-semibold text-primary underline hover:text-primary/80 cursor-pointer ml-1"
                            >
                                Select all {totalItems}
                            </button>
                        )}
                        {selectedItems.size > 0 && (
                            <button
                                type="button"
                                onClick={clearAllSelection}
                                className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer ml-1"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Hand gear over to the data team */}
                        {hasFeature('data_assets') && canManageDataAssets(user) && can('moveToDataTeam') && selectedItems.size > 0 && !isBulkEditMode && (
                            <button
                                onClick={() => setSelectedCustodian('DATA')}
                                disabled={custodianApplying}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                            >
                                Move to Data Team
                            </button>
                        )}

                        {isBulkEditMode ? (
                            <>
                                <button
                                    onClick={() => {
                                        setEditDrafts({});
                                        setIsBulkEditMode(false);
                                    }}
                                    disabled={isSavingDrafts}
                                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        const draftIds = Object.keys(editDrafts).filter(id =>
                                            canManageItem(user, items.find(i => i.id === id))
                                        );
                                        if (draftIds.length === 0) {
                                            setIsBulkEditMode(false);
                                            return;
                                        }
                                        setIsSavingDrafts(true);
                                        let hasError = false;
                                        for (const id of draftIds) {
                                            try {
                                                const d = editDrafts[id];
                                                await updateEquipment({ id, updates: d });
                                                const orig = items.find(i => i.id === id);
                                                if (orig) {
                                                    const changed: string[] = [];
                                                    if (d.name !== undefined && d.name.trim() !== orig.name) changed.push(`name: "${orig.name}" → "${d.name.trim()}"`);
                                                    if (d.category !== undefined && d.category !== orig.category) changed.push(`category: "${orig.category}" → "${d.category}"`);
                                                    if (d.barcode !== undefined && d.barcode !== orig.barcode) changed.push(`barcode: "${orig.barcode}" → "${d.barcode}"`);
                                                    if (d.serialNumber !== undefined && (d.serialNumber || '') !== (orig.serialNumber || '')) changed.push(`serial: "${orig.serialNumber || ''}" → "${d.serialNumber || ''}"`);
                                                    const origModel = orig.metadata?.model || '';
                                                    const newModel = d.metadata?.model || '';
                                                    if (d.metadata?.model !== undefined && newModel !== origModel) changed.push(`model: "${origModel}" → "${newModel}"`);
                                                    if (changed.length > 0) await logEquipmentEdit(orig, `Bulk edit "${orig.name}" (${orig.barcode}): ${changed.join(', ')}`);
                                                }
                                            } catch (error) {
                                                console.error(`Update failed for ${id}:`, error);
                                                hasError = true;
                                            }
                                        }
                                        setIsSavingDrafts(false);
                                        if (hasError) {
                                            showToast('Some updates failed', 'error');
                                        } else {
                                            showToast('All changes saved successfully', 'success');
                                            setEditDrafts({});
                                            setIsBulkEditMode(false);
                                            refresh();
                                        }
                                    }}
                                    disabled={isSavingDrafts}
                                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
                                >
                                    {isSavingDrafts ? 'Saving…' : 'Save Changes'}
                                </button>
                            </>
                        ) : (
                            <>
                                {can('generateBarcodes') && (
                                    <button
                                        onClick={openBarcodeGen}
                                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                                    >
                                        Generate Barcodes
                                    </button>
                                )}
                                {can('fixNames') && (
                                    <button
                                        onClick={openRename}
                                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                                    >
                                        Fix Names
                                    </button>
                                )}
                                {can('findReplace') && (
                                    <button
                                        onClick={() => setFrOpen(true)}
                                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                                    >
                                        Find & Replace
                                    </button>
                                )}
                                {can('bulkEdit') && (
                                    <button
                                        onClick={() => setIsBulkEditMode(true)}
                                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                                    >
                                        Bulk Edit
                                    </button>
                                )}
                                {can('printLabels') && (
                                    <button
                                        onClick={() => setQrModalOpen(true)}
                                        disabled={isGeneratingQR}
                                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-[#2c2c2e] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                                    >
                                        {isGeneratingQR ? 'Generating…' : 'Print QR / Labels'}
                                    </button>
                                )}
                                {can('bulkDelete') && (
                                    <button
                                        onClick={handleBulkDelete}
                                        disabled={isActionLoading}
                                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                                    >
                                        Delete
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Main Content Area (Fixed Viewport Card) */}
            <div className="rounded-xl shadow-2xs bg-white dark:bg-[#1c1c1e] border border-gray-200/80 dark:border-gray-800 flex-1 min-h-0 flex flex-col overflow-hidden">
                {isActionLoading || isInventoryLoading ? (
                    <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <Skeleton key={i} className="h-32 w-full rounded-xl" />
                        ))}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div ref={cardScrollRef} className="inventory-card-scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 sm:p-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
                            {paginatedItems.map((item) => {
                                const issue = getEquipmentIssue(item);

                                return (
                                    <Link
                                        key={item.id}
                                        id={`inventory-card-${item.barcode}`}
                                        data-inventory-barcode={item.barcode}
                                        href={`/inventory/${item.barcode}`}
                                        onClick={() => {
                                            if (typeof window !== 'undefined') {
                                                const scroller = cardScrollRef.current;
                                                sessionStorage.setItem('inventoryScroll', String(scroller?.scrollTop ?? 0));
                                                sessionStorage.setItem('inventoryFlash', item.barcode);
                                                sessionStorage.setItem('inventoryCurrentPage', String(currentPage));
                                            }
                                        }}
                                        className="block h-full"
                                    >
                                        <div className={`group bg-white dark:bg-[#1c1c1e] rounded-xl p-2.5 border transition-all duration-300 cursor-pointer h-full flex flex-col ${item.barcode === flashBarcode ? 'border-primary/40 bg-primary/[0.06] ring-1 ring-inset ring-primary/30' : selectedItems.has(item.id) ? 'border-primary/50 bg-primary/[0.04]' : 'border-gray-100 dark:border-gray-800 hover:border-primary/30 hover:shadow-xs'}`}>
                                            <div className="flex items-start justify-between gap-1.5 mb-1.5">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start gap-1 min-w-0">
                                                        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 break-words min-w-0 group-hover:text-primary transition-colors">
                                                            {item.name}
                                                        </h3>
                                                        {item.metadata?.size && !nameCovers(item, item.metadata.size) && (
                                                            <span className="shrink-0 text-[9px] font-semibold px-1 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 whitespace-nowrap max-w-[5rem] truncate">
                                                                {item.metadata.size}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {(() => {
                                                        const detail = itemDetailLineForRow(item);
                                                        return detail ? (
                                                            <p className="text-[11px] font-medium text-gray-500 truncate mt-0.5">{detail}</p>
                                                        ) : null;
                                                    })()}
                                                </div>
                                                <Badge
                                                    variant={getDisplayStatusVariant(item)}
                                                    className="text-[9px] font-semibold px-1.5 py-0.2 rounded shrink-0"
                                                >
                                                    {getDisplayStatus(item)}
                                                </Badge>
                                            </div>

                                            <div className="flex-1 flex flex-col justify-end">
                                                {item.serialNumber && (
                                                    <div className="mb-1.5">
                                                        <span className="text-[10px] font-mono font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                                                            {item.serialNumber}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between text-[10px] text-gray-400 mt-auto pt-1">
                                                    <span className="truncate pr-1">{item.category.trim().toLowerCase() === item.name.trim().toLowerCase() ? '' : item.category}</span>
                                                    <span className="font-mono text-gray-500 shrink-0">{item.barcode}</span>
                                                </div>

                                                {item.location && (
                                                    <div className="text-[10px] text-gray-500 truncate mt-0.5 flex items-center gap-1">
                                                        <span className="text-gray-400">Loc:</span> {item.location}
                                                    </div>
                                                )}

                                                {issue && (
                                                    <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] font-semibold leading-snug text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                                        <span className="block truncate">{getIssueSummary(issue)}</span>
                                                        <span className="block truncate font-medium">{issue.note}</span>
                                                    </div>
                                                )}

                                                {item.status !== 'AVAILABLE' && item.assignedTo && (
                                                    <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-800">
                                                        <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center">
                                                            <span className="text-[7px] font-bold text-white">
                                                                {getUserName(item.assignedTo)?.charAt(0).toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-gray-600 dark:text-gray-400 truncate">
                                                            {getUserName(item.assignedTo)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div ref={tableScrollRef} className="inventory-list-scroll flex-1 min-h-0 overflow-auto custom-scrollbar">
                        <div className="w-full min-w-full" style={{ minWidth: `${minTableWidth}px` }}>
                            {/* Table Header (Sticky at Top with Resizer Handles & 3-Dots Menu) */}
                            <div className="sticky top-0 z-20 bg-gray-50 dark:bg-[#1f1f23] border-b border-gray-200 dark:border-gray-800 flex items-stretch w-full text-[10px] sm:text-[11px] 2xl:text-xs font-semibold text-gray-500 dark:text-gray-400 select-none uppercase tracking-wider shadow-2xs">
                                <div ref={headerRef} className="flex items-center flex-1 min-w-0">
                                    {orderedVisibleColumns.map((colKey, colIdx) => {
                                        const isLast = colIdx === orderedVisibleColumns.length - 1;
                                        const isDragOver = dragOverCol === colKey;
                                        const isDragging = draggedCol === colKey;
                                        const isSelectCol = colKey === 'select';
                                        const isNameCol = colKey === 'name';
                                        const isStickyCol = isSelectCol || isNameCol;
                                        const selectWidth = colWidths.select || DEFAULT_COLUMN_WIDTHS.select || 40;
                                        const stickyLeft = isSelectCol ? 0 : selectWidth;

                                        return (
                                            <div
                                                key={colKey}
                                                data-col-key={colKey}
                                                style={{
                                                    ...getColumnStyle(colKey),
                                                    ...(isStickyCol ? { position: 'sticky', left: `${stickyLeft}px`, zIndex: isSelectCol ? 35 : 30 } : {})
                                                }}
                                                draggable={!resizingCol && colKey !== 'select' && colKey !== 'name'}
                                                onDragStart={(e) => handleHeaderDragStart(colKey, e)}
                                                onDragOver={(e) => handleHeaderDragOver(colKey, e)}
                                                onDrop={(e) => handleHeaderDrop(colKey, e)}
                                                onDragEnd={handleHeaderDragEnd}
                                                className={`relative flex items-center ${
                                                    isSelectCol ? 'px-0 justify-center' : 'px-2 xl:px-2.5 2xl:px-3'
                                                } py-1.5 2xl:py-2 group/header ${
                                                    colKey !== 'select' && colKey !== 'name' ? 'cursor-grab active:cursor-grabbing' : ''
                                                } transition-colors ${
                                                    !isLast ? 'border-r border-gray-200 dark:border-gray-800' : ''
                                                } ${isDragOver ? 'bg-primary/20 ring-2 ring-primary ring-inset' : ''} ${
                                                    isDragging ? 'opacity-30' : ''
                                                } ${
                                                    isStickyCol ? 'bg-gray-50 dark:bg-[#1f1f23]' : ''
                                                } ${
                                                    isNameCol && isTableScrolled ? 'shadow-[4px_0_8px_-3px_rgba(0,0,0,0.12)] dark:shadow-[4px_0_8px_-3px_rgba(0,0,0,0.4)]' : ''
                                                }`}
                                                title={colKey !== 'select' && colKey !== 'name' ? "Drag column header left/right to reorder" : undefined}
                                            >
                                                <div className="flex items-center min-w-0 flex-1 w-full">
                                                    {colKey === 'select' && (
                                                        <div className="flex items-center justify-center w-full min-w-0">
                                                            <button
                                                                type="button"
                                                                onClick={toggleSelectAll}
                                                                className="flex items-center justify-center cursor-pointer"
                                                                title="Select all on this page"
                                                            >
                                                                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                                                                    paginatedItems.length > 0 && paginatedItems.every(i => selectedItems.has(i.id))
                                                                        ? 'border-primary bg-primary text-white'
                                                                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                                                                }`}>
                                                                    {paginatedItems.length > 0 && paginatedItems.every(i => selectedItems.has(i.id)) && (
                                                                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                </span>
                                                            </button>
                                                        </div>
                                                    )}

                                                    {colKey === 'name' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSort('name')}
                                                            className="flex items-center truncate text-left font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white transition-colors cursor-pointer outline-none focus:outline-none select-none w-full"
                                                            title="Sort by Equipment Name"
                                                        >
                                                            <span className="truncate">Equipment Name</span> <SortIndicator field="name" />
                                                        </button>
                                                    )}

                                                    {colKey === 'brand' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSort('brand')}
                                                            className="flex items-center truncate text-left font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white transition-colors cursor-pointer outline-none focus:outline-none select-none w-full"
                                                            title="Sort by Brand"
                                                        >
                                                            <span className="truncate">Brand</span> <SortIndicator field="brand" />
                                                        </button>
                                                    )}

                                                    {colKey === 'model' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSort('model')}
                                                            className="flex items-center truncate text-left font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white transition-colors cursor-pointer outline-none focus:outline-none select-none w-full"
                                                            title="Sort by Model"
                                                        >
                                                            <span className="truncate">Model</span> <SortIndicator field="model" />
                                                        </button>
                                                    )}

                                                    {colKey === 'size' && (
                                                        <span className="text-gray-500 dark:text-gray-400 font-bold truncate">
                                                            Size
                                                        </span>
                                                    )}

                                                    {colKey === 'category' && (
                                                        <div className="flex items-center gap-1 min-w-0 w-full justify-between">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSort('category')}
                                                                className="font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white flex items-center gap-0.5 truncate cursor-pointer outline-none focus:outline-none select-none"
                                                                title="Sort by Category"
                                                            >
                                                                <span className="truncate">Category</span> <SortIndicator field="category" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-filter-trigger="category"
                                                                onClick={(e) => toggleFilterMenu('category', e)}
                                                                className={`p-1 rounded-md transition-all shrink-0 flex items-center gap-0.5 cursor-pointer outline-none focus:outline-none select-none ${
                                                                    isCategoryFiltered
                                                                        ? 'bg-primary text-white shadow-xs px-1.5'
                                                                        : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700'
                                                                }`}
                                                                title={`Filter by Category (${categoryFilter.length > 0 ? `${categoryFilter.length} selected` : 'All'})`}
                                                            >
                                                                <Filter size={11} className={isCategoryFiltered ? 'fill-current' : ''} />
                                                                {isCategoryFiltered && (
                                                                    <span className="text-[10px] font-bold leading-none">{categoryFilter.length}</span>
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}

                                                    {colKey === 'barcode' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSort('barcode')}
                                                            className="flex items-center truncate text-left font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white transition-colors cursor-pointer outline-none focus:outline-none select-none w-full"
                                                            title="Sort by Barcode"
                                                        >
                                                            <span className="truncate">Barcode</span> <SortIndicator field="barcode" />
                                                        </button>
                                                    )}

                                                    {colKey === 'serialNumber' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSort('serialNumber')}
                                                            className="flex items-center truncate text-left font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white transition-colors cursor-pointer outline-none focus:outline-none select-none w-full"
                                                            title="Sort by Serial Number"
                                                        >
                                                            <span className="truncate">S/N</span> <SortIndicator field="serialNumber" />
                                                        </button>
                                                    )}

                                                    {colKey === 'status' && (
                                                        <div className="flex items-center gap-1 min-w-0 w-full justify-between">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSort('status')}
                                                                className="font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white flex items-center gap-0.5 truncate cursor-pointer outline-none focus:outline-none select-none"
                                                                title="Sort by Status"
                                                            >
                                                                <span className="truncate">Status</span> <SortIndicator field="status" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-filter-trigger="status"
                                                                onClick={(e) => toggleFilterMenu('status', e)}
                                                                className={`p-1 rounded-md transition-all shrink-0 flex items-center gap-0.5 cursor-pointer outline-none focus:outline-none select-none ${
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

                                                    {colKey === 'action' && (
                                                        <div className="flex items-center justify-center w-full min-w-0">
                                                            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Action</span>
                                                        </div>
                                                    )}

                                                    {colKey === 'assignedToName' && (
                                                        <div className="flex items-center gap-1 min-w-0 w-full justify-between">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSort('assignedToName')}
                                                                className="font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white flex items-center gap-0.5 min-w-0 truncate cursor-pointer outline-none focus:outline-none select-none"
                                                                title="Sort by Assignee"
                                                            >
                                                                <span className="truncate">Assignee</span> <SortIndicator field="assignedToName" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-filter-trigger="assignee"
                                                                onClick={(e) => toggleFilterMenu('assignee', e)}
                                                                className={`p-1 rounded-md transition-all shrink-0 flex items-center gap-0.5 cursor-pointer outline-none focus:outline-none select-none ${
                                                                    isAssigneeFiltered
                                                                        ? 'bg-primary text-white shadow-xs px-1.5'
                                                                        : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700'
                                                                }`}
                                                                title="Filter by Assignee"
                                                            >
                                                                <Filter size={11} className={isAssigneeFiltered ? 'fill-current' : ''} />
                                                            </button>
                                                        </div>
                                                    )}

                                                    {colKey === 'location' && (
                                                        <div className="flex items-center gap-1 min-w-0 w-full justify-between">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSort('location')}
                                                                className="font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white flex items-center gap-0.5 truncate cursor-pointer outline-none focus:outline-none select-none"
                                                                title="Sort by Location"
                                                            >
                                                                <span className="truncate">Location</span> <SortIndicator field="location" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-filter-trigger="location"
                                                                onClick={(e) => toggleFilterMenu('location', e)}
                                                                className={`p-1 rounded-md transition-all shrink-0 flex items-center gap-0.5 cursor-pointer outline-none focus:outline-none select-none ${
                                                                    isLocationFiltered
                                                                        ? 'bg-primary text-white shadow-xs px-1.5'
                                                                        : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700'
                                                                }`}
                                                                title="Filter by Location"
                                                            >
                                                                <Filter size={11} className={isLocationFiltered ? 'fill-current' : ''} />
                                                            </button>
                                                        </div>
                                                    )}

                                                    {colKey === 'createdAt' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSort('createdAt')}
                                                            className="flex items-center truncate text-left font-bold text-gray-700 dark:text-gray-200 hover:text-gray-950 dark:hover:text-white transition-colors cursor-pointer outline-none focus:outline-none select-none w-full"
                                                            title="Sort by Added Date"
                                                        >
                                                            <span className="truncate">Added Date</span> <SortIndicator field="createdAt" />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Clean Full-Height Column Resizer Handle */}
                                                <div
                                                    onMouseDown={(e) => handleMouseDownResize(colKey, e)}
                                                    onTouchStart={(e) => handleTouchStartResize(colKey, e)}
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

                                {/* Permanent Fixed 3-Dots Menu at far right of Table Header */}
                                <div className="relative shrink-0 flex items-center justify-center w-9 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1f1f23] z-30" ref={columnMenuRef}>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsColumnMenuOpen(!isColumnMenuOpen);
                                        }}
                                        className={`p-1 rounded-md transition-all cursor-pointer ${
                                            isColumnMenuOpen
                                                ? 'bg-primary text-white shadow-xs'
                                                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700'
                                        }`}
                                        title="Configure columns &amp; ordering"
                                    >
                                        <MoreVertical size={14} />
                                    </button>

                                    {/* Column Management Dropdown Menu */}
                                    {isColumnMenuOpen && (
                                        <div 
                                            onClick={(e) => e.stopPropagation()} 
                                            className="absolute top-full right-0 mt-1 w-64 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1c1c1e] shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150 normal-case tracking-normal"
                                        >
                                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 dark:border-gray-800">
                                                <div>
                                                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">Customize Columns</h4>
                                                    <p className="text-[10px] text-gray-400">Reorder &amp; toggle visibility</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleResetColumns}
                                                    className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                                                >
                                                    Reset
                                                </button>
                                            </div>

                                            <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5 custom-scrollbar">
                                                {columnOrder.filter(k => k !== 'select').map((colKey, index) => {
                                                    const colDef = ALL_COLUMNS.find(c => c.id === colKey);
                                                    if (!colDef) return null;
                                                    const isChecked = visibleColumns.includes(colKey);
                                                    const isMandatory = colDef.mandatory;

                                                    return (
                                                        <div
                                                            key={colKey}
                                                            onClick={() => {
                                                                if (!isMandatory) toggleColumn(colKey);
                                                            }}
                                                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors select-none ${
                                                                isMandatory
                                                                    ? 'bg-gray-50/80 dark:bg-gray-800/30 cursor-default opacity-85'
                                                                    : 'cursor-pointer ' + (isChecked ? 'bg-gray-50 dark:bg-gray-800/60' : 'opacity-60 hover:opacity-90')
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                                                                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                                                                    isChecked
                                                                        ? 'border-primary bg-primary text-white'
                                                                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                                                                }`}>
                                                                    {isChecked && (
                                                                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                </span>
                                                                <span className={`font-medium truncate ${isChecked ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                    {colDef.label}
                                                                </span>
                                                                {isMandatory && (
                                                                    <span className="text-[9px] font-semibold uppercase px-1 py-0.2 rounded bg-gray-200/80 dark:bg-gray-700 text-gray-500 dark:text-gray-400 ml-1">
                                                                        Required
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Reorder Buttons */}
                                                            {!isMandatory ? (
                                                                <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            moveColumn(colKey, 'up');
                                                                        }}
                                                                        disabled={index <= 1}
                                                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
                                                                        title="Move column left / up"
                                                                    >
                                                                        <ChevronUp size={13} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            moveColumn(colKey, 'down');
                                                                        }}
                                                                        disabled={index === columnOrder.filter(k => k !== 'select').length - 1}
                                                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
                                                                        title="Move column right / down"
                                                                    >
                                                                        <ChevronDown size={13} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] text-gray-400 font-medium italic pr-1">Pinned</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Table Body Rows */}
                            <div className="divide-y divide-gray-100 dark:divide-gray-800/70 w-full">
                                {paginatedItems.map((item, index) => {
                                    const issue = getEquipmentIssue(item);
                                    return (
                                        <div
                                            key={item.id}
                                            id={`inventory-row-${item.barcode}`}
                                            data-inventory-barcode={item.barcode}
                                            onClick={() => {
                                                if (isBulkEditMode) return;
                                                if (typeof window !== 'undefined' && window.getSelection()?.toString()) return;
                                                openItem(item.barcode);
                                            }}
                                            className="group w-full"
                                        >
                                            <div className={`flex items-center w-full transition-colors ${
                                                !isBulkEditMode ? 'cursor-pointer' : ''
                                            } ${
                                                item.barcode === flashBarcode 
                                                    ? 'bg-[#eef2ff] dark:bg-[#1e1e38] ring-1 ring-inset ring-primary/40' 
                                                    : selectedItems.has(item.id) 
                                                        ? 'bg-[#f0fdf4] dark:bg-[#052e16] hover:bg-[#e2f9e8] dark:hover:bg-[#07381b]' 
                                                        : index % 2 === 1 
                                                            ? 'bg-[#f9fafb] dark:bg-[#18181b] hover:bg-[#f0f7ff] dark:hover:bg-[#1a2333]' 
                                                            : 'bg-white dark:bg-[#1c1c1e] hover:bg-[#f0f7ff] dark:hover:bg-[#1a2333]'
                                            }`}>
                                                <div className="flex items-center flex-1 min-w-0">
                                                    {orderedVisibleColumns.map((colKey, colIdx) => {
                                                        const isLast = colIdx === orderedVisibleColumns.length - 1;
                                                        const isSelectCol = colKey === 'select';
                                                        const isNameCol = colKey === 'name';
                                                        const isStickyCol = isSelectCol || isNameCol;
                                                        const selectWidth = colWidths.select || DEFAULT_COLUMN_WIDTHS.select || 40;
                                                        const stickyLeft = isSelectCol ? 0 : selectWidth;

                                                        return (
                                                            <div
                                                                key={colKey}
                                                                style={{
                                                                    ...getColumnStyle(colKey),
                                                                    ...(isStickyCol ? { position: 'sticky', left: `${stickyLeft}px`, zIndex: isSelectCol ? 15 : 10 } : {})
                                                                }}
                                                                className={`${
                                                                    isSelectCol ? 'px-0 justify-center' : 'px-2 xl:px-2.5 2xl:px-3'
                                                                } py-1.5 2xl:py-2 flex items-center min-h-[34px] 2xl:min-h-[40px] text-xs min-w-0 ${
                                                                    !isLast ? 'border-r border-gray-100 dark:border-gray-800/60' : ''
                                                                } ${
                                                                    isStickyCol
                                                                        ? (item.barcode === flashBarcode 
                                                                            ? 'bg-[#eef2ff] dark:bg-[#1e1e38]' 
                                                                            : selectedItems.has(item.id) 
                                                                                ? 'bg-[#f0fdf4] dark:bg-[#052e16] group-hover:bg-[#e2f9e8] dark:group-hover:bg-[#07381b]' 
                                                                                : (index % 2 === 1 
                                                                                    ? 'bg-[#f9fafb] dark:bg-[#18181b]' 
                                                                                    : 'bg-white dark:bg-[#1c1c1e]'
                                                                                  ) + ' group-hover:bg-[#f0f7ff] dark:group-hover:bg-[#1a2333]'
                                                                          )
                                                                        : ''
                                                                } ${
                                                                    isNameCol && isTableScrolled ? 'shadow-[4px_0_8px_-3px_rgba(0,0,0,0.12)] dark:shadow-[4px_0_8px_-3px_rgba(0,0,0,0.4)]' : ''
                                                                }`}
                                                            >
                                                                {colKey === 'select' && (
                                                                    <div className="flex items-center justify-center shrink-0 w-full" onClick={(e) => e.stopPropagation()}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => toggleSelect(e, item.id)}
                                                                            className="flex items-center justify-center cursor-pointer"
                                                                        >
                                                                            <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                                                                                selectedItems.has(item.id)
                                                                                    ? 'border-primary bg-primary text-white'
                                                                                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                                                                            }`}>
                                                                                {selectedItems.has(item.id) && (
                                                                                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                                    </svg>
                                                                                )}
                                                                            </span>
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                {colKey === 'name' && (
                                                                    <div className="min-w-0 w-full">
                                                                        {isBulkEditMode ? (
                                                                            <InlineInput value={editDrafts[item.id]?.name ?? item.name} onChange={(val) => handleDraftChange(item.id, 'name', val)} placeholder="Name" />
                                                                        ) : (
                                                                            <>
                                                                                <div className="font-medium text-gray-900 dark:text-gray-100 truncate hover:text-primary transition-colors" title={item.name}>
                                                                                    {item.name}
                                                                                </div>
                                                                                {(!visibleColumns.includes('brand') || !visibleColumns.includes('model')) && (item.metadata?.brand || item.metadata?.model) && (
                                                                                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate leading-tight mt-0.5" title={`${item.metadata?.brand || ''} ${item.metadata?.model || ''}`.trim()}>
                                                                                        {[item.metadata?.brand, item.metadata?.model].filter(Boolean).join(' · ')}
                                                                                    </div>
                                                                                )}
                                                                                {issue && (
                                                                                    <div className="mt-0.5 flex max-w-[320px] items-start gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                                                                        <svg className="mt-0.5 h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                                                                        </svg>
                                                                                        <span className="line-clamp-2">{getIssueSummary(issue)}: {issue.note}</span>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {colKey === 'brand' && (
                                                                    <div className="min-w-0 w-full text-gray-600 dark:text-gray-400 truncate" title={item.metadata?.brand || ''}>
                                                                        {isBulkEditMode ? (
                                                                            <InlineInput value={editDrafts[item.id]?.metadata?.brand ?? item.metadata?.brand ?? ''} onChange={(val) => handleMetadataDraftChange(item, 'brand', val)} placeholder="Brand" />
                                                                        ) : (item.metadata?.brand || '—')}
                                                                    </div>
                                                                )}

                                                                {colKey === 'model' && (
                                                                    <div className="min-w-0 w-full text-gray-600 dark:text-gray-400 truncate" title={item.metadata?.model || ''}>
                                                                        {isBulkEditMode ? (
                                                                            <InlineInput value={editDrafts[item.id]?.metadata?.model ?? item.metadata?.model ?? ''} onChange={(val) => handleMetadataDraftChange(item, 'model', val)} placeholder="Model" />
                                                                        ) : (item.metadata?.model || '—')}
                                                                    </div>
                                                                )}

                                                                {colKey === 'size' && (
                                                                    <div className="min-w-0 w-full text-gray-600 dark:text-gray-400 truncate" title={item.metadata?.size || ''}>
                                                                        {isBulkEditMode ? (
                                                                            <InlineInput value={editDrafts[item.id]?.metadata?.size ?? item.metadata?.size ?? ''} onChange={(val) => handleMetadataDraftChange(item, 'size', val)} placeholder="Size" />
                                                                        ) : (item.metadata?.size || '—')}
                                                                    </div>
                                                                )}

                                                                {colKey === 'category' && (
                                                                    <div className="min-w-0 w-full text-gray-600 dark:text-gray-400 truncate" title={item.category}>
                                                                        {isBulkEditMode ? (
                                                                            <InlineInput value={editDrafts[item.id]?.category ?? item.category} onChange={(val) => handleDraftChange(item.id, 'category', val)} placeholder="Category" />
                                                                        ) : item.category}
                                                                    </div>
                                                                )}

                                                                {colKey === 'barcode' && (
                                                                    <div className="min-w-0 w-full font-mono text-gray-600 dark:text-gray-400 truncate" title={item.barcode}>
                                                                        {isBulkEditMode ? (
                                                                            <InlineInput value={editDrafts[item.id]?.barcode ?? item.barcode} onChange={(val) => handleDraftChange(item.id, 'barcode', val)} placeholder="Barcode" />
                                                                        ) : item.barcode}
                                                                    </div>
                                                                )}

                                                                {colKey === 'serialNumber' && (
                                                                    <div className="min-w-0 w-full font-mono text-gray-600 dark:text-gray-400 truncate" title={item.serialNumber || ''}>
                                                                        {isBulkEditMode ? (
                                                                            <InlineInput value={editDrafts[item.id]?.serialNumber ?? item.serialNumber ?? ''} onChange={(val) => handleDraftChange(item.id, 'serialNumber', val)} placeholder="S/N" />
                                                                        ) : (item.serialNumber || '—')}
                                                                    </div>
                                                                )}

                                                                {colKey === 'status' && (
                                                                    <div className="min-w-0 flex items-center">
                                                                        <Badge variant={getDisplayStatusVariant(item)} className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap">
                                                                            {getDisplayStatus(item)}
                                                                        </Badge>
                                                                    </div>
                                                                )}

                                                                {colKey === 'action' && (
                                                                    <div className="min-w-0 w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => handlePrintQR(e, item)}
                                                                            className="p-1 rounded-md text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                                                                            title="Print QR"
                                                                        >
                                                                            <svg className="w-4 h-4 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                {colKey === 'assignedToName' && (
                                                                    <div className="min-w-0 w-full text-gray-600 dark:text-gray-400 truncate" title={item.status !== 'AVAILABLE' ? (getUserName(item.assignedTo) || '-') : '-'}>
                                                                        {item.status !== 'AVAILABLE' ? (getUserName(item.assignedTo) || '-') : '-'}
                                                                    </div>
                                                                )}

                                                                {colKey === 'location' && (
                                                                    <div className="min-w-0 w-full text-gray-600 dark:text-gray-400 truncate" title={item.location || '—'}>
                                                                        {item.location || '—'}
                                                                    </div>
                                                                )}

                                                                {colKey === 'createdAt' && (
                                                                    <div className="min-w-0 w-full whitespace-nowrap text-gray-400 truncate">
                                                                        {(item.createdAt || item.lastActivity)
                                                                            ? new Date(item.createdAt || item.lastActivity!).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                                                                            : '—'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className="w-9 shrink-0 border-l border-transparent" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {totalItems === 0 && !isInventoryLoading && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-12 h-12 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">No items found</h3>
                        <p className="text-xs text-gray-500 mt-1 mb-4 max-w-sm">
                            We could not find any items matching your current filters. Try adjusting your search criteria.
                        </p>
                        {hasAnyFilterActive && (
                            <button
                                onClick={resetAllFilters}
                                className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors cursor-pointer"
                            >
                                Clear all filters
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Modern Pagination Controls (Fixed Footer & Compact, matching Shoots page) */}
            {totalItems > 0 && (
                <div className="shrink-0">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-2 sm:p-2.5 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-[#1c1c1e] rounded-xl border border-gray-200/80 dark:border-gray-800 shadow-2xs">
                        {/* Left: Row Count Details */}
                        <div className="flex items-center gap-2 text-[11px] sm:text-xs">
                            <span>
                                Showing <strong className="font-semibold text-gray-900 dark:text-white">{fromIndex}</strong> to <strong className="font-semibold text-gray-900 dark:text-white">{toIndex}</strong> of <strong className="font-semibold text-gray-900 dark:text-white">{totalItems}</strong> items
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
                                    className="p-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                >
                                    <ChevronsLeft size={13} />
                                </button>
                                <button
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    aria-label="Previous page"
                                    title="Previous page"
                                    className="p-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                >
                                    <ChevronLeft size={13} />
                                </button>

                                {/* Page numbers */}
                                <div className="flex items-center gap-1 mx-0.5">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                        .map((p, idx, arr) => {
                                            const prevP = arr[idx - 1];
                                            const showEllipsis = prevP && p - prevP > 1;
                                            return (
                                                <React.Fragment key={p}>
                                                    {showEllipsis && <span className="px-0.5 text-gray-400 text-xs">…</span>}
                                                    <button
                                                        onClick={() => handlePageChange(p)}
                                                        className={`min-w-[28px] h-7 px-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                                                            currentPage === p
                                                                ? 'bg-primary text-primary-foreground shadow-2xs'
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
                                    className="p-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                >
                                    <ChevronRight size={13} />
                                </button>
                                <button
                                    onClick={() => handlePageChange(totalPages)}
                                    disabled={currentPage === totalPages}
                                    aria-label="Last page"
                                    title="Last page"
                                    className="p-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                >
                                    <ChevronsRight size={13} />
                                </button>
                            </div>
                        )}

                        {/* Right: Page Size Selector */}
                        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                            <span className="text-gray-500 dark:text-gray-400">Rows per page:</span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                                    setPageSize(val);
                                    setCurrentPage(1);
                                }}
                                className="px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium focus:ring-1 focus:ring-primary cursor-pointer shadow-2xs"
                            >
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value="ALL">All</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}
            {ncOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
                    <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-[#1c1c1e]">
                        <div className="flex items-center justify-between border-b border-border px-5 py-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Normalize connectors</h3>
                                <p className="text-xs text-muted-foreground">{ncGroups.length} name group{ncGroups.length !== 1 ? 's' : ''} · {ncConnectorCount} item{ncConnectorCount !== 1 ? 's' : ''}. Auto-parsed from the current name — review & fix, then Apply.</p>
                            </div>
                            <button onClick={() => setNcOpen(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-4">
                            {/* header row */}
                            <div className="nc-row-grid hidden px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
                                <span>Current (×count)</span><span>End A</span><span>M/F</span><span>End B</span><span>M/F</span><span>Size</span>
                            </div>
                            <div className="space-y-2">
                                {ncGroups.map(g => {
                                    const e = ncEdits[g.name];
                                    if (!e) return null;
                                    const newName = buildConnectorName(e.endA, e.endAGender, e.endB, e.endBGender);
                                    const code = buildConnectorCode(e.endA, e.endAGender, e.endB, e.endBGender);
                                    return (
                                        <div key={g.name} className="rounded-lg border border-border bg-secondary/20 p-2">
                                            <div className="nc-row-grid">
                                                <div className="min-w-0">
                                                    <div className="truncate text-[13px] font-medium text-foreground" title={g.name}>{g.name}</div>
                                                    <div className="text-[11px] text-muted-foreground">×{g.list.length}</div>
                                                </div>
                                                <input value={e.endA} onChange={ev => setNcEdit(g.name, { endA: ev.target.value })} placeholder="End A"
                                                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                                                <select value={e.endAGender} onChange={ev => setNcEdit(g.name, { endAGender: ev.target.value as EndGender })}
                                                    className="h-9 w-full rounded-lg border border-border bg-background px-1 text-sm outline-none focus:ring-2 focus:ring-primary">
                                                    <option value="">—</option><option value="M">M</option><option value="F">F</option>
                                                </select>
                                                <input value={e.endB} onChange={ev => setNcEdit(g.name, { endB: ev.target.value })} placeholder="End B"
                                                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                                                <select value={e.endBGender} onChange={ev => setNcEdit(g.name, { endBGender: ev.target.value as EndGender })}
                                                    className="h-9 w-full rounded-lg border border-border bg-background px-1 text-sm outline-none focus:ring-2 focus:ring-primary">
                                                    <option value="">—</option><option value="M">M</option><option value="F">F</option>
                                                </select>
                                                <input value={e.size} onChange={ev => setNcEdit(g.name, { size: ev.target.value })} placeholder="Size"
                                                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                                            </div>
                                            <div className="mt-1 flex flex-wrap gap-x-4 px-1 text-[11px]">
                                                <span className="text-muted-foreground">→ <span className="font-semibold text-foreground">{newName || '(cleared — will skip)'}</span></span>
                                                {code && <span className="text-muted-foreground">code <span className="font-mono text-foreground">{code}</span></span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
                            <span className="text-[11px] text-muted-foreground">Applies Name + ends + size + model code. Then use <b>Generate Barcodes</b> to renumber.</span>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setNcOpen(false)}>Cancel</Button>
                                <Button variant="primary" size="sm" disabled={ncApplying || ncGroups.length === 0} onClick={runNormalize}>
                                    {ncApplying ? 'Applying…' : `Apply to ${ncConnectorCount}`}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Generate Barcodes dialog */}
            {bcOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
                    <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-[#1c1c1e]">
                        <div className="flex items-center justify-between border-b border-border px-5 py-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Generate barcodes</h3>
                                <p className="text-xs text-muted-foreground">
                                    {selectedItems.size > 0
                                        ? `${selectedItems.size} selected item${selectedItems.size !== 1 ? 's' : ''}`
                                        : `all ${frTargets.length} filtered item${frTargets.length !== 1 ? 's' : ''}`}
                                </p>
                            </div>
                            <button onClick={() => setBcOpen(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
                        </div>

                        <div className="space-y-3 overflow-y-auto p-5">
                            <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[12px] text-muted-foreground">
                                Regenerates using the standard scheme <span className="font-mono text-foreground">CATEGORY-MODEL-№</span> (e.g. <span className="font-mono text-foreground">BAT-NPF970-1</span>). Numbering continues after existing barcodes — same as Add / Import. Items with the same category + model are numbered together.
                            </div>

                            <div className="rounded-xl border border-border bg-secondary/30 p-3">
                                {bcChanges.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No items to regenerate.</p>
                                ) : (
                                    <>
                                        <p className="mb-2 text-xs font-semibold text-foreground">{bcChanges.length} item{bcChanges.length !== 1 ? 's' : ''}</p>
                                        <div className="max-h-52 space-y-1 overflow-y-auto">
                                            {bcChanges.slice(0, 12).map(({ item, barcode }) => (
                                                <div key={item.id} className="flex items-center gap-2 text-[11px] leading-tight">
                                                    <span className="truncate text-muted-foreground">{item.name}</span>
                                                    <span className="ml-auto shrink-0 font-mono text-red-500 line-through">{item.barcode}</span>
                                                    <span className="shrink-0 text-muted-foreground">→</span>
                                                    <span className="shrink-0 font-mono font-semibold text-green-600 dark:text-green-400">{barcode}</span>
                                                </div>
                                            ))}
                                            {bcChanges.length > 12 && <p className="text-[11px] text-muted-foreground">…and {bcChanges.length - 12} more</p>}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                            <Button variant="outline" size="sm" onClick={() => setBcOpen(false)}>Cancel</Button>
                            <Button variant="primary" size="sm" disabled={bcApplying || bcChanges.length === 0} onClick={runBarcodeGen}>
                                {bcApplying ? 'Applying…' : `Regenerate (${bcChanges.length})`}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fix Names — compose names from brand + model + size + category, by category */}
            {rnOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/50">
                    <div className="modal-overlay-in flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-[#1c1c1e]">
                        <div className="flex items-center justify-between border-b border-border px-5 py-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fix names</h3>
                                <p className="text-xs text-muted-foreground">
                                    {selectedItems.size > 0
                                        ? `${selectedItems.size} selected item${selectedItems.size !== 1 ? 's' : ''}`
                                        : `all ${frTargets.length} filtered item${frTargets.length !== 1 ? 's' : ''}`}
                                </p>
                            </div>
                            <button onClick={() => setRnOpen(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
                        </div>

                        <div className="space-y-3 overflow-y-auto p-5">
                            <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[12px] text-muted-foreground">
                                Rebuilds the name as <span className="font-medium text-foreground">brand · model · size · category</span> —
                                e.g. <span className="font-medium text-foreground">Sony NP F970 Small Battery</span>. Items named after
                                their category are ticked for you; anything that looks deliberately named is left
                                unticked. Connectors are never touched.
                            </div>

                            <div className="rounded-xl border border-border bg-secondary/30 p-3">
                                {rnCandidates.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                        Nothing here needs renaming. Filter or select different items to widen the scope.
                                    </p>
                                ) : (
                                    <>
                                        <p className="mb-2 text-xs font-semibold text-foreground">
                                            {rnSelected.length} of {rnCandidates.length} selected
                                        </p>
                                        <div className="max-h-64 space-y-1 overflow-y-auto">
                                            {rnCandidates.map(({ item, proposed, safe }) => {
                                                const on = safe ? !rnSkipped.has(item.id) : rnSkipped.has(item.id);
                                                return (
                                                    <label
                                                        key={item.id}
                                                        className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-[11px] leading-tight hover:bg-muted/60"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={on}
                                                            onChange={() => toggleRenameItem(item.id)}
                                                            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                                                        />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-red-500 line-through">{item.name}</span>
                                                            <span className="block truncate font-semibold text-green-600 dark:text-green-400">{proposed}</span>
                                                        </span>
                                                        {!safe && (
                                                            <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                                                custom
                                                            </span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                            <Button variant="outline" size="sm" onClick={() => setRnOpen(false)}>Cancel</Button>
                            <Button
                                variant="primary"
                                size="sm"
                                disabled={rnApplying || rnSelected.length === 0}
                                onClick={runRename}
                            >
                                {rnApplying ? 'Renaming…' : `Rename (${rnSelected.length})`}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Find & Replace dialog */}
            {frOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
                    <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-[#1c1c1e]">
                        <div className="flex items-center justify-between border-b border-border px-5 py-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Find &amp; Replace</h3>
                                <p className="text-xs text-muted-foreground">
                                    {selectedItems.size > 0
                                        ? `${selectedItems.size} selected item${selectedItems.size !== 1 ? 's' : ''}`
                                        : `all ${frTargets.length} filtered item${frTargets.length !== 1 ? 's' : ''}`}
                                </p>
                            </div>
                            <button onClick={() => setFrOpen(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
                        </div>

                        <div className="space-y-3 overflow-y-auto p-5">
                            <div>
                                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Field</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {(['all', 'name', 'barcode', 'category', 'model', 'size'] as const).map(f => (
                                        <button key={f} onClick={() => setFrField(f)}
                                            className={`h-9 rounded-lg border text-xs font-semibold capitalize transition-colors ${frField === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                                            {f === 'all' ? 'All fields' : f}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Find</label>
                                <input value={frFind} onChange={e => setFrFind(e.target.value)} placeholder="Text to find…" autoFocus
                                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Replace with</label>
                                <input value={frReplace} onChange={e => setFrReplace(e.target.value)} placeholder="Replacement (leave empty to remove)"
                                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
                            </div>

                            <label className="flex cursor-pointer items-center gap-2">
                                <input type="checkbox" checked={frCase} onChange={e => setFrCase(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                                <span className="text-sm text-foreground">Match case</span>
                            </label>

                            {/* Preview */}
                            <div className="rounded-xl border border-border bg-secondary/30 p-3">
                                {!frFind ? (
                                    <p className="text-xs text-muted-foreground">Type text to find to preview changes.</p>
                                ) : frChanges.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No matches in the {selectedItems.size > 0 ? 'selected' : 'filtered'} items.</p>
                                ) : (
                                    <>
                                        <p className="mb-2 text-xs font-semibold text-foreground">{frChanges.length} item{frChanges.length !== 1 ? 's' : ''} will change</p>
                                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                            {frChanges.slice(0, 8).map(({ item, upd, meta }) => {
                                                const parts: { f: string; from: string; to: string }[] = [];
                                                Object.entries(upd).forEach(([f, to]) => parts.push({ f, from: frFieldValue(item, f as 'name' | 'barcode' | 'category'), to }));
                                                Object.entries(meta).forEach(([f, to]) => parts.push({ f, from: frFieldValue(item, f as 'model' | 'size'), to }));
                                                return (
                                                    <div key={item.id} className="text-[11px] leading-tight">
                                                        {parts.map((p, idx) => (
                                                            <div key={idx} className="truncate">
                                                                <span className="uppercase text-muted-foreground">{p.f}: </span>
                                                                <span className="text-red-500 line-through">{p.from}</span>
                                                                <span className="text-muted-foreground"> → </span>
                                                                <span className="font-semibold text-green-600 dark:text-green-400">{p.to || '(empty)'}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })}
                                            {frChanges.length > 8 && <p className="text-[11px] text-muted-foreground">…and {frChanges.length - 8} more</p>}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                            <Button variant="outline" size="sm" onClick={() => setFrOpen(false)}>Cancel</Button>
                            <Button variant="primary" size="sm" disabled={frApplying || !frFind || frChanges.length === 0} onClick={runFindReplace}>
                                {frApplying ? 'Applying…' : `Replace${frChanges.length ? ` (${frChanges.length})` : ''}`}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {qrModalOpen && (() => {
                // ---- Accurate mini-sheet preview — uses the SAME layout + uniform font the
                // PDF uses, so margins, grid, QR size and text size all match the print. ----
                const L = computeQrLayout(labelConfig);
                const pwMM = L.pageW, phMM = L.pageH;
                const mX = L.marginX, mY = L.marginY;
                const cellMM = L.cell;
                const usableWmm = pwMM - mX * 2, usableHmm = phMM - mY * 2;
                const colsP = L.cols, rowsP = L.rows;
                const gOX = L.originX, gOY = L.originY;
                const qrMM = L.qrSize;
                const sheetScale = Math.min(260 / pwMM, 340 / phMM); // whole-sheet thumbnail
                const zoomScale = 210 / cellMM;                      // one big, readable label

                const previewName = sampleLabelItem.barcode;
                const previewSerial = maskSerialText(sampleLabelItem.serialNumber, labelConfig.maskSerial);
                type Tk = { text: string; bold: boolean; pt: number };
                const slots: (Tk & { pos: LabelPos })[] = [];
                if (labelConfig.showName) slots.push({ text: previewName, bold: labelConfig.boldName, pt: previewFit.name, pos: labelConfig.namePos });
                if (labelConfig.showSerial) slots.push({ text: previewSerial || 'S/N —', bold: false, pt: previewFit.serial, pos: labelConfig.serialPos });
                const at = (p: LabelPos) => slots.filter(s => s.pos === p);

                const rotStyle: React.CSSProperties = { writingMode: 'vertical-rl', transform: 'rotate(180deg)' };
                // One cell renderer, parameterised by scale (px per mm). Each line uses the
                // exact size the PDF will print it at (per-line auto-fit), so preview == print.
                const renderCell = (s: number, key?: React.Key, forceBorder = false) => {
                    const cPx = cellMM * s, qPx = qrMM * s;
                    const gPx = labelConfig.gap * s;
                    const el = (t: Tk, i: number, rotate = false) => (
                        <span key={i} style={{ fontSize: Math.max(2, t.pt * 0.3528 * s), lineHeight: 1.05, ...(rotate ? rotStyle : {}) }}
                            className={`whitespace-nowrap text-gray-900 ${t.bold ? 'font-bold' : 'font-normal'}`}>
                            {t.text}
                        </span>
                    );
                    return (
                        <div key={key} style={{ width: cPx, height: cPx }} className="relative flex items-center justify-center">
                            {(labelConfig.cutGuides || forceBorder) && <div className="pointer-events-none absolute inset-0 border border-gray-300" />}
                            <div className="flex flex-col items-center justify-center" style={{ gap: gPx }}>
                                {at('top').map((t, i) => el(t, i))}
                                <div className="flex items-center justify-center" style={{ gap: gPx }}>
                                    {at('left').map((t, i) => el(t, i, true))}
                                    {labelConfig.showQr && previewQr && <img src={previewQr} alt="" style={{ width: qPx, height: qPx, imageRendering: 'pixelated' }} />}
                                    {at('right').map((t, i) => el(t, i, true))}
                                </div>
                                {at('bottom').map((t, i) => el(t, i))}
                            </div>
                        </div>
                    );
                };
                // Cap rendered thumbnail cells for performance (still shows margins + overflow).
                const showCols = colsP;
                const showRows = colsP * rowsP > 160 ? Math.max(1, Math.floor(160 / colsP)) : rowsP;
                const PosPicker = ({ value, onPick }: { value: LabelPos; onPick: (p: LabelPos) => void }) => (
                    <div className="grid grid-cols-4 gap-1">
                        {(['top', 'bottom', 'left', 'right'] as const).map(p => (
                            <button key={p} onClick={() => onPick(p)}
                                className={`h-8 rounded-lg border text-xs font-semibold capitalize transition-colors ${value === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                                {p}
                            </button>
                        ))}
                    </div>
                );
                const Slider = ({ label, val, min, max, step, unit, onChange }: { label: string; val: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) => (
                    <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-semibold text-muted-foreground">{label}</span>
                            <span className="tabular-nums text-foreground">{val}{unit}</span>
                        </div>
                        <input type="range" min={min} max={max} step={step} value={val} onChange={e => onChange(Number(e.target.value))} className="w-full accent-primary" />
                    </div>
                );

                return (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
                        <div
                            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-[#1c1c1e]"
                        >
                            <div className="flex items-center justify-between border-b border-border px-5 py-3">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Label designer</h3>
                                    <p className="text-xs text-muted-foreground">{selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected</p>
                                </div>
                                <button onClick={() => setQrModalOpen(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button>
                            </div>

                            <div className="designer-grid min-h-0 flex-1 overflow-y-auto">
                                {/* Controls */}
                                <div className="space-y-4 p-5">
                                    <div>
                                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Label preset</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {([['standard', 24], ['small', 17]] as const).map(([sz, mm]) => (
                                                <button key={sz} onClick={() => { setCfg('size', sz); setCfg('cellSize', mm); }}
                                                    className={`h-9 rounded-lg border text-sm font-semibold transition-colors ${labelConfig.size === sz ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-muted'}`}>
                                                    {sz === 'standard' ? 'Standard · 24mm' : 'Small · 17mm'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Page size</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['a4', 'a3'] as const).map(ps => (
                                                <button key={ps} onClick={() => setCfg('pageSize', ps)}
                                                    className={`h-9 rounded-lg border text-sm font-semibold uppercase transition-colors ${labelConfig.pageSize === ps ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-muted'}`}>
                                                    {ps === 'a4' ? 'A4' : 'A3 · more per sheet'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <Slider label={`Cell square (min cut size)`} val={labelConfig.cellSize} min={12} max={40} step={1} unit="mm" onChange={v => setCfg('cellSize', v)} />

                                    <div className="grid grid-cols-2 gap-3">
                                        <Slider label="Margin L/R" val={labelConfig.marginX} min={0} max={40} step={1} unit="mm" onChange={v => setCfg('marginX', v)} />
                                        <Slider label="Margin T/B" val={labelConfig.marginY} min={0} max={40} step={1} unit="mm" onChange={v => setCfg('marginY', v)} />
                                    </div>

                                    <label className="flex cursor-pointer items-center gap-3">
                                        <input type="checkbox" checked={labelConfig.fillSheet} onChange={e => setCfg('fillSheet', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                                        <span className="text-sm font-semibold text-foreground">Fill sheet <span className="font-normal text-muted-foreground">(enlarge labels to use the space)</span></span>
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-3">
                                        <input type="checkbox" checked={labelConfig.cutGuides} onChange={e => setCfg('cutGuides', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                                        <span className="text-sm font-semibold text-foreground">Cut guide grid</span>
                                    </label>

                                    {/* QR */}
                                    <label className="flex cursor-pointer items-center gap-3">
                                        <input type="checkbox" checked={labelConfig.showQr} onChange={e => setCfg('showQr', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                                        <span className="text-sm font-semibold text-foreground">QR code</span>
                                    </label>
                                    {labelConfig.showQr && (
                                        <div className="pl-7">
                                            <Slider label="QR quiet zone (white border)" val={labelConfig.qrMargin} min={0} max={4} step={1} onChange={v => setCfg('qrMargin', v)} />
                                            <p className="mt-1 text-[11px] text-muted-foreground">Lower = bigger QR / less white space. Keep ≥1 so scanners still read it.</p>
                                        </div>
                                    )}

                                    {/* Name */}
                                    <div>
                                        <label className="flex cursor-pointer items-center gap-3">
                                            <input type="checkbox" checked={labelConfig.showName} onChange={e => setCfg('showName', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                                            <span className="text-sm font-semibold text-foreground">Name / barcode</span>
                                        </label>
                                        {labelConfig.showName && <div className="mt-2 pl-7"><PosPicker value={labelConfig.namePos} onPick={p => setCfg('namePos', p)} /></div>}
                                    </div>

                                    {/* Serial */}
                                    <div>
                                        <label className="flex cursor-pointer items-center gap-3">
                                            <input type="checkbox" checked={labelConfig.showSerial} onChange={e => setCfg('showSerial', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                                            <span className="text-sm font-semibold text-foreground">Serial number</span>
                                        </label>
                                        {labelConfig.showSerial && (
                                            <div className="mt-2 space-y-2 pl-7">
                                                <PosPicker value={labelConfig.serialPos} onPick={p => setCfg('serialPos', p)} />
                                                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-1.5 dark:border-amber-900/50 dark:bg-amber-950/20">
                                                    <input type="checkbox" checked={labelConfig.maskSerial} onChange={e => setCfg('maskSerial', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                                                    <span className="text-[12px] text-amber-800 dark:text-amber-200">Show last 4 only <span className="opacity-70">(recommended)</span></span>
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    <Slider label="Text size" val={labelConfig.fontSize} min={5} max={14} step={0.5} unit="pt" onChange={v => setCfg('fontSize', v)} />
                                    <label className="flex cursor-pointer items-center gap-3">
                                        <input type="checkbox" checked={labelConfig.boldName} onChange={e => setCfg('boldName', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                                        <span className="text-sm font-semibold text-foreground">Bold name / barcode</span>
                                    </label>
                                    <label className="flex cursor-pointer items-start gap-3">
                                        <input type="checkbox" checked={labelConfig.autoFit} onChange={e => setCfg('autoFit', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border accent-primary" />
                                        <span className="text-sm font-semibold text-foreground">Auto-fit long text
                                            <span className="block text-[11px] font-normal text-muted-foreground">Keep the text size fixed; shrink only labels whose text is too long for the cell.</span>
                                        </span>
                                    </label>
                                    <Slider label="Gap (QR ↔ text)" val={labelConfig.gap} min={0} max={6} step={0.5} unit="mm" onChange={v => setCfg('gap', v)} />
                                </div>

                                {/* Live preview — big zoomed label + full-sheet thumbnail */}
                                <div className="flex flex-col items-center gap-4 border-t border-border bg-gray-50 p-5 dark:bg-[#151517] md:border-l md:border-t-0">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Live preview · {labelConfig.pageSize.toUpperCase()}</p>

                                    {/* Zoom: one label at readable size — QR is legible, text overflow past the cut square is visible */}
                                    <div className="flex flex-col items-center gap-1.5">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">One label · {labelConfig.cellSize}mm square</span>
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 shadow-sm">
                                            {renderCell(zoomScale, 'zoom', true)}
                                        </div>
                                    </div>

                                    {/* Sheet thumbnail: layout, margins, cut grid, count */}
                                    <div className="flex flex-col items-center gap-1.5">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Full sheet</span>
                                        <div className="relative bg-white shadow-sm ring-1 ring-gray-300" style={{ width: pwMM * sheetScale, height: phMM * sheetScale }}>
                                            <div className="pointer-events-none absolute border border-dashed border-primary/50" style={{ left: mX * sheetScale, top: mY * sheetScale, width: usableWmm * sheetScale, height: usableHmm * sheetScale }} />
                                            <div className="absolute" style={{ left: gOX * sheetScale, top: gOY * sheetScale }}>
                                                {Array.from({ length: showRows }).map((_, r) => (
                                                    <div key={r} className="flex">
                                                        {Array.from({ length: showCols }).map((_, c) => renderCell(sheetScale, `${r}-${c}`))}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-center text-[11px] text-muted-foreground">
                                        {colsP} × {rowsP} = <span className="font-semibold text-foreground">{colsP * rowsP}</span> labels/sheet
                                        {showRows < rowsP ? ` · thumbnail shows top ${showRows} rows` : ''}
                                    </p>
                                    <button onClick={() => setLabelConfig(DEFAULT_LABEL_CONFIG)} className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">Reset to default</button>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                                <Button variant="outline" size="sm" onClick={() => setQrModalOpen(false)}>Cancel</Button>
                                <Button variant="secondary" size="sm" onClick={() => { try { localStorage.setItem(LABEL_CONFIG_KEY, JSON.stringify(labelConfig)); showToast('Label settings saved', 'success'); } catch { /* ignore */ } }}>Save settings</Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    disabled={isGeneratingQR || (!labelConfig.showQr && !labelConfig.showName && !labelConfig.showSerial)}
                                    onClick={() => { try { localStorage.setItem(LABEL_CONFIG_KEY, JSON.stringify(labelConfig)); } catch { /* ignore */ } setQrModalOpen(false); handleBulkDownloadQR(labelConfig); }}
                                >
                                    {isGeneratingQR ? 'Generating…' : 'Download PDF'}
                                </Button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Floating In-Header Column Filter Dropdown (Rendered in Portal to avoid clipping) */}
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
                    {filterAnchor.type === 'status' && (
                        <div className="flex flex-col max-h-[380px]">
                            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 dark:border-gray-800 mb-1 shrink-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-gray-900 dark:text-white text-xs">Filter by Status</span>
                                    {isStatusFiltered && (
                                        <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                                            {statusFilter.length}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {isStatusFiltered ? (
                                        <button
                                            type="button"
                                            onClick={selectAllStatuses}
                                            className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                                        >
                                            Reset to All
                                        </button>
                                    ) : (
                                        <span className="text-[11px] text-gray-400">All visible</span>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-0.5 overflow-y-auto pr-1 scrollbar-thin flex-1 min-h-0">
                                {ALL_STATUS_OPTIONS.map((opt) => {
                                    const count = statusCounts[opt.value] || 0;
                                    const isAllOption = opt.value === 'ALL';
                                    const isChecked = isAllOption
                                        ? isAllStatusesSelected
                                        : !isAllStatusesSelected && statusFilter.includes(opt.value);

                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => toggleStatusFilter(opt.value)}
                                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                                isChecked
                                                    ? 'bg-primary/10 text-primary font-semibold'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                                                    isChecked
                                                        ? 'border-primary bg-primary text-white'
                                                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                                                }`}>
                                                    {isChecked && <Check size={10} strokeWidth={3} />}
                                                </span>
                                                {!isAllOption && (
                                                    <span
                                                        className="w-2 h-2 rounded-full shrink-0"
                                                        style={{ backgroundColor: opt.color }}
                                                    />
                                                )}
                                                <span className="truncate">{opt.label}</span>
                                            </div>
                                            <span className="text-[10px] text-gray-400 font-mono shrink-0 ml-2">
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {filterAnchor.type === 'category' && (
                        <div className="flex flex-col max-h-[380px]">
                            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 dark:border-gray-800 mb-1 shrink-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-gray-900 dark:text-white text-xs">Filter by Category</span>
                                    {isCategoryFiltered && (
                                        <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                                            {categoryFilter.length}
                                        </span>
                                    )}
                                </div>
                                {categoryFilter.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => { setCategoryFilter([]); setCurrentPage(1); }}
                                        className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            <div className="px-1 py-1 mb-1">
                                <input
                                    type="text"
                                    placeholder="Search category…"
                                    value={categorySearchQuery}
                                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                                    className="w-full h-7 px-2 text-xs bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            <div className="space-y-0.5 overflow-y-auto pr-1 scrollbar-thin flex-1 min-h-0">
                                {categoryOptions
                                    .filter(opt => opt.label.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                                    .map((opt) => {
                                        const isChecked = categoryFilter.includes(opt.value);
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => {
                                                    setCategoryFilter(prev =>
                                                        prev.includes(opt.value)
                                                            ? prev.filter(c => c !== opt.value)
                                                            : [...prev, opt.value]
                                                    );
                                                    setCurrentPage(1);
                                                }}
                                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                                    isChecked
                                                        ? 'bg-primary/10 text-primary font-semibold'
                                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                                                        isChecked
                                                            ? 'border-primary bg-primary text-white'
                                                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                                                    }`}>
                                                        {isChecked && <Check size={10} strokeWidth={3} />}
                                                    </span>
                                                    <span className="truncate">{opt.label}</span>
                                                </div>
                                                <span className="text-[10px] text-gray-400 font-mono shrink-0 ml-2">
                                                    {categoryCounts[opt.label] || 0}
                                                </span>
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    {filterAnchor.type === 'assignee' && (
                        <div className="flex flex-col max-h-[380px]">
                            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 dark:border-gray-800 mb-1 shrink-0">
                                <span className="font-bold text-gray-900 dark:text-white text-xs">Filter by Assignee</span>
                                {isAssigneeFiltered && (
                                    <button
                                        type="button"
                                        onClick={() => { setAssigneeFilter('ALL'); setCurrentPage(1); }}
                                        className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            <div className="px-1 py-1 mb-1">
                                <input
                                    type="text"
                                    placeholder="Search assignee…"
                                    value={assigneeSearchQuery}
                                    onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                                    className="w-full h-7 px-2 text-xs bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            <div className="space-y-0.5 overflow-y-auto pr-1 scrollbar-thin flex-1 min-h-0">
                                <button
                                    type="button"
                                    onClick={() => { setAssigneeFilter('ALL'); setFilterAnchor(null); setCurrentPage(1); }}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                        assigneeFilter === 'ALL'
                                            ? 'bg-primary/10 text-primary font-semibold'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <span>All Assignees</span>
                                    {assigneeFilter === 'ALL' && <Check size={12} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setAssigneeFilter('UNASSIGNED'); setFilterAnchor(null); setCurrentPage(1); }}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                        assigneeFilter === 'UNASSIGNED'
                                            ? 'bg-primary/10 text-primary font-semibold'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <span>Unassigned (Available)</span>
                                    {assigneeFilter === 'UNASSIGNED' && <Check size={12} />}
                                </button>
                                {assigneeOptions
                                    .filter(u => u.name.toLowerCase().includes(assigneeSearchQuery.toLowerCase()))
                                    .map((u) => {
                                        const isChecked = assigneeFilter === u.id;
                                        const userCount = assigneeCounts[u.id] || 0;
                                        return (
                                            <button
                                                key={u.id}
                                                type="button"
                                                onClick={() => { setAssigneeFilter(u.id); setFilterAnchor(null); setCurrentPage(1); }}
                                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                                    isChecked
                                                        ? 'bg-primary/10 text-primary font-semibold'
                                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                                <span className="truncate">{u.name}</span>
                                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                    {userCount > 0 && (
                                                        <span className="text-[10px] text-gray-400 font-mono">
                                                            {userCount}
                                                        </span>
                                                    )}
                                                    {isChecked && <Check size={12} />}
                                                </div>
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    {filterAnchor.type === 'location' && (
                        <div className="flex flex-col max-h-[380px]">
                            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-100 dark:border-gray-800 mb-1 shrink-0">
                                <span className="font-bold text-gray-900 dark:text-white text-xs">Filter by Location</span>
                                {isLocationFiltered && (
                                    <button
                                        type="button"
                                        onClick={() => { setLocationFilter('ALL'); setCurrentPage(1); }}
                                        className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            <div className="space-y-0.5 overflow-y-auto pr-1 scrollbar-thin flex-1 min-h-0">
                                <button
                                    type="button"
                                    onClick={() => { setLocationFilter('ALL'); setFilterAnchor(null); setCurrentPage(1); }}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                        locationFilter === 'ALL'
                                            ? 'bg-primary/10 text-primary font-semibold'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <span>All Locations</span>
                                    {locationFilter === 'ALL' && <Check size={12} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setLocationFilter('UNASSIGNED'); setFilterAnchor(null); setCurrentPage(1); }}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                        locationFilter === 'UNASSIGNED'
                                            ? 'bg-primary/10 text-primary font-semibold'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <span>No Location</span>
                                    {locationFilter === 'UNASSIGNED' && <Check size={12} />}
                                </button>
                                {locationOptions.map((loc) => {
                                    const isChecked = locationFilter === loc;
                                    const locCount = locationCounts[loc] || 0;
                                    return (
                                        <button
                                            key={loc}
                                            type="button"
                                            onClick={() => { setLocationFilter(loc); setFilterAnchor(null); setCurrentPage(1); }}
                                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                                                isChecked
                                                    ? 'bg-primary/10 text-primary font-semibold'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            <span className="truncate">{loc}</span>
                                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                <span className="text-[10px] text-gray-400 font-mono">
                                                    {locCount}
                                                </span>
                                                {isChecked && <Check size={12} />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

export default function InventoryPage() {
    return (
        <React.Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <InventoryPageContent />
        </React.Suspense>
    );
}
