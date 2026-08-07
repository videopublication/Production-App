'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { ScanLine, Search, X } from 'lucide-react';
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
    const cleanupData = useMemo(() => {
        const activeTransactionItemIds = new Set(
            transactions
                .filter(t => t.status === 'OPEN')
                .flatMap(t => t.items)
        );

        const staleAssignments = items.filter(i => i.status === 'AVAILABLE' && i.assignedTo);
        const ghostCheckouts = items.filter(i =>
            i.status === 'CHECKED_OUT' && !activeTransactionItemIds.has(i.id)
        );

        return { staleAssignments, ghostCheckouts };
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
                    location: 'Storage' // Default back to storage or keep existing if known? Safest is usually Storage or previous.
                }
            })
        ));
    };

    const handleCleanupAssignments = async () => {
        if (isActionLoading) return;

        const { staleAssignments, ghostCheckouts } = cleanupData;
        const totalIssues = staleAssignments.length + ghostCheckouts.length;

        if (totalIssues === 0) {
            showToast('No data inconsistencies found', 'info');
            return;
        }

        const messageParts = [`Found ${totalIssues} issue${totalIssues === 1 ? '' : 's'}:`];

        if (staleAssignments.length) {
            messageParts.push(formatCleanupSection('Available items with stale assignees', staleAssignments));
        }

        if (ghostCheckouts.length) {
            messageParts.push(formatCleanupSection('Checked-out items without an active transaction', ghostCheckouts));
        }

        messageParts.push('Fix All will clear stale assignees and set checked-out orphan items back to Available.');

        const isConfirmed = await confirm({
            title: 'Fix Data Inconsistencies?',
            message: messageParts.join('\n\n') || `Found ${totalIssues} issues:\n` +
                (staleAssignments.length ? `• ${staleAssignments.length} available items with stale assignees\n` : '') +
                (ghostCheckouts.length ? `• ${ghostCheckouts.length} items marked 'Checked Out' but not in any active transaction` : ''),
            confirmLabel: 'Fix All',
            variant: 'danger'
        });

        if (!isConfirmed) return;

        setIsActionLoading(true);
        try {
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

    // ... (rest of component state) ...
    // Persist search so navigating into an item and back (which remounts this page)
    // doesn't wipe the query and force the user to search again.
    const [search, setSearch] = useState(() => {
        if (typeof window !== 'undefined') return sessionStorage.getItem('inventorySearch') || '';
        return '';
    });
    const [showInventoryScanner, setShowInventoryScanner] = useState(false);
    const searchParams = useSearchParams();
    const [statusFilter, setStatusFilter] = useState<EquipmentStatus | 'ALL' | 'NEEDS_ATTENTION'>(() => {
        const statusParam = searchParams.get('status');
        if (statusParam && ['ALL', 'AVAILABLE', 'CHECKED_OUT', 'PENDING_VERIFICATION', 'NEEDS_ATTENTION'].includes(statusParam)) {
            return statusParam as EquipmentStatus | 'ALL' | 'NEEDS_ATTENTION';
        }
        return 'ALL';
    });
    // Multiple categories/brands/sizes can be active at once. Empty array = all.
    const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
    const [brandFilter, setBrandFilter] = useState<string[]>([]);
    const [sizeFilter, setSizeFilter] = useState<string[]>([]);
    const [endFilter, setEndFilter] = useState<string[]>([]); // connector ends (matches either end)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
        if (typeof window !== 'undefined') {
            return (sessionStorage.getItem('inventoryViewMode') as 'grid' | 'list') || 'grid';
        }
        return 'grid';
    });
    const [sortConfig, setSortConfig] = useState<{ key: keyof Equipment | 'assignedToName'; direction: 'asc' | 'desc' } | null>(null);
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

    useEffect(() => {
        sessionStorage.setItem('inventoryViewMode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        sessionStorage.setItem('inventorySearch', search);
    }, [search]);

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
            const scroller = document.querySelector('.app-main-scroll');
            sessionStorage.setItem('inventoryScroll', String(scroller?.scrollTop ?? 0));
            sessionStorage.setItem('inventoryFlash', barcode);
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
                const scroller = document.querySelector('.app-main-scroll');
                if (scroller) scroller.scrollTop = y;
            });
        }
        return () => { if (raf) cancelAnimationFrame(raf); };
        // Run once on mount — after data (React Query cache) has rendered rows.
    }, []);

    // Narrowing the list doesn't move the scroll position, so filtering 500 rows down to 2
    // leaves you parked in the empty space where the rest of the list used to be. Reset to the
    // top whenever the filter selection changes — skipping the first run, which would fight
    // the scroll restore above.
    const filterSignature = JSON.stringify([statusFilter, categoryFilter, brandFilter, sizeFilter, endFilter]);
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
            return String(data.barcode || data.id || decodedText).trim();
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

    const handleSort = (key: keyof Equipment | 'assignedToName') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredItems = useMemo(() => {
        // This page is the GEAR catalogue. The data team's items (cards, drives, laptops,
        // readers) live on /data-assets instead, so the two teams never wade through each
        // other's kit. Both still go out through the same checkout.
        let result = items.filter(item => !isDataAsset(item));

        // NOTE: Department filtering is already done at the Supabase query level in useEquipment().
        // No need to re-filter by department here — it would cause items to appear empty
        // if item.departmentId isn't mapped correctly.

        if (search.trim()) {
            // Token-AND search: every word in the query must appear somewhere across the
            // item's fields (name/category/barcode/serial/model), separator-insensitive
            // and order-independent. So "fz 100 battery" matches an item named "Battery"
            // with model "FZ-100", and "fz-100"/"fz100"/"fz 100" all behave the same.
            const normalize = (str: string) => str.toLowerCase().replace(/[\s\-_]/g, '');
            const tokens = search.trim().split(/\s+/).map(normalize).filter(Boolean);
            result = result.filter(item => {
                const hay = normalize(
                    [item.name, item.category, item.barcode, item.serialNumber, item.metadata?.model, item.metadata?.brand, item.metadata?.size, item.metadata?.endA, item.metadata?.endB]
                        .filter(Boolean)
                        .join(' ')
                );
                return tokens.every(t => hay.includes(t));
            });
        }

        if (statusFilter !== 'ALL') {
            if (statusFilter === 'NEEDS_ATTENTION') {
                result = result.filter(item => ['MAINTENANCE', 'DAMAGED', 'LOST'].includes(item.status) || hasEquipmentIssue(item));
            } else {
                result = result.filter(item => item.status === statusFilter);
            }
        }

        if (categoryFilter.length > 0) {
            result = result.filter(item => categoryFilter.includes(normalizeCat(item.category)));
        }

        if (brandFilter.length > 0) {
            result = result.filter(item => brandFilter.includes(normalizeCat(item.metadata?.brand || '')));
        }

        if (sizeFilter.length > 0) {
            // '__none__' matches items with no size set.
            result = result.filter(item => {
                const sz = normalizeCat(item.metadata?.size || '');
                return sizeFilter.includes(sz || '__none__');
            });
        }

        if (endFilter.length > 0) {
            // Match items where EITHER connector end is a selected end.
            result = result.filter(item => {
                const a = normalizeCat(item.metadata?.endA || '');
                const b = normalizeCat(item.metadata?.endB || '');
                return endFilter.includes(a) || endFilter.includes(b);
            });
        }

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aValue: string | number | null | undefined = a[sortConfig.key as keyof Equipment] as string | number | null | undefined;
                let bValue: string | number | null | undefined = b[sortConfig.key as keyof Equipment] as string | number | null | undefined;

                if (sortConfig.key === 'assignedToName') {
                    aValue = getUserName(a.assignedTo) || '';
                    bValue = getUserName(b.assignedTo) || '';
                }

                const valA = (aValue ?? '').toString();
                const valB = (bValue ?? '').toString();

                // Natural/numeric compare so "…-2" sorts before "…-10" (not lexicographic).
                const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
                return sortConfig.direction === 'asc' ? cmp : -cmp;
            });
        }

        return result;
    }, [items, search, statusFilter, categoryFilter, brandFilter, sizeFilter, endFilter, sortConfig, getUserName]);

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
            .map(([value, label]) => ({ value, label }))
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

    const SortIcon = ({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) => (
        <svg className={`w-4 h-4 ml-1 transition-colors ${active ? 'text-primary' : 'text-muted-foreground/30'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {active && direction === 'desc' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            )}
        </svg>
    );

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
        if (selectedItems.size === filteredItems.length && filteredItems.length > 0) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredItems.map(item => item.id)));
        }
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
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
            <div className="flex flex-col gap-3 sm:gap-4">
                <div className="flex items-center justify-between gap-2">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Inventory</h1>
                    <div className="flex items-center gap-1 sm:gap-2">
                        <div className="flex bg-secondary p-0.5 sm:p-1 rounded-lg border border-border">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 sm:p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 sm:p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                            </button>
                        </div>
                        {(user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
                            <div className="flex gap-1 sm:gap-2">
                                {/* database cleanup button - shows only if needed */}
                                {(cleanupData.staleAssignments.length > 0 || cleanupData.ghostCheckouts.length > 0) && can('fixData') && (
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        className="whitespace-nowrap px-2 sm:px-3 animate-pulse"
                                        onClick={handleCleanupAssignments}
                                        title="Fix inconsistent data in database"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-database-zap"><path d="M7.4 17.65c-.66.86-1.4 1.85-1.4 3.75 0 0 4.1 1.7 8 0 0-1.9-.74-2.89-1.4-3.75l-5.2-7.25c-.66-.86.13-1.65.95-1.65h3.3c.82 0 1.61.79.95 1.65l-5.2 7.25Z" /><path d="M12 2c5.523 0 10 4.477 10 10 0 2.275-.76 4.375-2.031 6.094" /><path d="M2.031 11.906A10 10 0 0 1 12 2" /></svg>
                                        <span className="hidden sm:inline ml-2">Fix Data ({cleanupData.staleAssignments.length + cleanupData.ghostCheckouts.length})</span>
                                    </Button>
                                )}
                                <Link href="/inventory/bulk-add">
                                    <Button variant="secondary" size="sm" className="whitespace-nowrap px-2 sm:px-3">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span className="hidden sm:inline ml-2">Bulk Import</span>
                                    </Button>
                                </Link>
                                {can('exportCsv') && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="whitespace-nowrap px-2 sm:px-3"
                                    onClick={() => {
                                        const headers = ['Name', 'Category', 'Barcode', 'Serial Number', 'Status', 'Assigned To'];
                                        const rows = filteredItems.map(item => [
                                            `"${item.name.replace(/"/g, '""')}"`,
                                            `"${item.category.replace(/"/g, '""')}"`,
                                            item.barcode,
                                            item.serialNumber || '',
                                            item.status,
                                            item.assignedTo ? (users[item.assignedTo] || 'Unknown') : ''
                                        ].join(','));

                                        const csvContent = [headers.join(','), ...rows].join('\n');
                                        downloadFile(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), `inventory_export_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
                                    }}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="hidden sm:inline ml-2">Export CSV</span>
                                </Button>
                                )}
                                <Link href="/inventory/add">
                                    <Button className="whitespace-nowrap px-2 sm:px-4" size="sm">
                                        <span className="hidden sm:inline">Add Equipment</span>
                                        <span className="sm:hidden">+ Add</span>
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex h-14 w-full items-center gap-2 rounded-2xl border border-border bg-secondary/50 pl-4 pr-3 transition-all duration-200 focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary">
                    <Search className="h-5 w-5 shrink-0 text-muted-foreground sm:h-6 sm:w-6" />
                    <input
                        type="search"
                        placeholder="Search name, barcode, serial…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') openLookupItem(search);
                        }}
                        className="h-full min-w-0 flex-1 bg-transparent py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button
                        type="button"
                        className={`flex h-11 w-12 shrink-0 items-center justify-center rounded-2xl border transition-all active:scale-95 ${showInventoryScanner
                            ? 'border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                            : 'border-border bg-[#1f2937] text-white hover:bg-[#273449] dark:bg-secondary dark:text-foreground dark:hover:bg-secondary/80'
                            }`}
                        onClick={() => setShowInventoryScanner(prev => !prev)}
                        title={showInventoryScanner ? 'Hide scanner' : 'Scan item'}
                        aria-label={showInventoryScanner ? 'Hide scanner' : 'Scan item'}
                    >
                        <ScanLine className="h-6 w-6" strokeWidth={2.25} />
                    </button>
                </div>

                {showInventoryScanner && (
                    <div className="overflow-hidden rounded-[28px] border border-border bg-card p-3 shadow-xl shadow-black/10 dark:bg-[#1c1c1e]">
                        <div className="mb-3 flex items-center justify-between gap-3 px-1">
                            <div className="min-w-0">
                                <h2 className="text-[18px] font-bold text-foreground">QR Code Scanner</h2>
                                <p className="truncate text-[13px] text-muted-foreground">Scan an item to open its details.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowInventoryScanner(false)}
                                className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                Close
                            </button>
                        </div>

                        <div className="md:hidden h-[min(72vh,560px)] min-h-[420px] overflow-hidden rounded-[24px] bg-black shadow-[0_16px_40px_-16px_rgba(0,0,0,0.55)]">
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

                {/* Filter bar: status tabs, then Category / Brand / Size facet pickers.
                    Pick any combination, then Select all + Export/QR/Bulk Edit act on the
                    filtered rows. */}
                <div className="space-y-2.5">
                    <div className="w-full overflow-x-auto scrollbar-hide">
                        <div className="flex gap-1.5 sm:gap-2 pb-0.5">
                            {(['ALL', 'AVAILABLE', 'CHECKED_OUT', 'PENDING_VERIFICATION', 'NEEDS_ATTENTION'] as const).map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`whitespace-nowrap flex-shrink-0 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${statusFilter === status
                                        ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-black'
                                        : 'bg-transparent text-[#86868b] hover:bg-[#e8e8ed] hover:text-[#1d1d1f] dark:hover:bg-[#2c2c2e] dark:hover:text-white'
                                        }`}
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                >
                                    {status === 'ALL' ? 'All' : status === 'NEEDS_ATTENTION' ? 'Needs Attention' : status === 'PENDING_VERIFICATION' ? 'Pending' : status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* One Filters control (popover on desktop, bottom sheet on phones) holding
                        all facets, with applied values shown as removable chips. Status has its
                        own tabs above; free-text has the search bar. */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                        <FacetFilters
                            resultCount={filteredItems.length}
                            groups={[
                                { key: 'category', label: 'Category', options: categoryOptions, selected: categoryFilter, onChange: setCategoryFilter },
                                { key: 'brand', label: 'Brand', options: brandOptions, selected: brandFilter, onChange: setBrandFilter },
                                { key: 'size', label: 'Size', options: sizeOptions, selected: sizeFilter, onChange: setSizeFilter },
                                { key: 'end', label: 'Connector end', options: endOptions, selected: endFilter, onChange: setEndFilter },
                            ]}
                        />
                        <span className="ml-auto whitespace-nowrap text-[13px] font-medium text-muted-foreground">
                            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </div>

            {viewMode === 'list' && (
                <div className="flex items-center justify-between bg-secondary/30 rounded-lg px-4 py-2 border border-border flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 rounded border-border accent-primary"
                            />
                            <span className="text-sm text-muted-foreground">
                                {selectedItems.size > 0 ? `${selectedItems.size} selected` : 'Select all'}
                            </span>
                        </label>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Hand gear over to the data team. They move items back from their
                            own page, since this list no longer shows their items. */}
                        {hasFeature('data_assets') && canManageDataAssets(user) && can('moveToDataTeam') && selectedItems.size > 0 && !isBulkEditMode && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedCustodian('DATA')}
                                isLoading={custodianApplying}
                                className="gap-2"
                            >
                                Move to data team
                            </Button>
                        )}
                        {['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DATA_MANAGER'].includes(user?.role || '') && (
                            <>
                                {isBulkEditMode ? (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setEditDrafts({});
                                                setIsBulkEditMode(false);
                                            }}
                                            className="gap-2 text-muted-foreground"
                                            disabled={isSavingDrafts}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={async () => {
                                                // Custodian boundary — never write an item this
                                                // user doesn't own, even if a draft exists for it.
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
                                                            if (d.name !== undefined) changed.push(`name→"${d.name}"`);
                                                            if (d.category !== undefined) changed.push(`category→"${d.category}"`);
                                                            if (d.barcode !== undefined) changed.push(`barcode→"${d.barcode}"`);
                                                            if (d.serialNumber !== undefined) changed.push(`serial→"${d.serialNumber || ''}"`);
                                                            if (d.metadata?.model !== undefined) changed.push(`model→"${d.metadata.model || ''}"`);
                                                            if (changed.length) await logEquipmentEdit(orig, `Bulk edit "${orig.name}" (${orig.barcode}): ${changed.join(', ')}`);
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
                                            className="gap-2"
                                            disabled={isSavingDrafts}
                                        >
                                            {isSavingDrafts ? (
                                                <>
                                                    <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                    Saving...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Save Changes
                                                </>
                                            )}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        {ncConnectorCount > 0 && can('normalizeConnectors') && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={openNormalize}
                                                className="gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                                </svg>
                                                Normalize Connectors
                                            </Button>
                                        )}
                                        {can('generateBarcodes') && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={openBarcodeGen}
                                                className="gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h1m3 0h1m3 0h1m3 0h1M4 18h1m3 0h1m3 0h1m3 0h1M4 12h16" />
                                                </svg>
                                                Generate Barcodes
                                            </Button>
                                        )}
                                        {can('fixNames') && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={openRename}
                                                className="gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5a1 1 0 011-1h14a1 1 0 011 1v2M9 20h6M12 4v16" />
                                                </svg>
                                                Fix Names
                                            </Button>
                                        )}
                                        {can('findReplace') && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setFrOpen(true)}
                                                className="gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 6a5 5 0 015 5m-5 5a5 5 0 100-10 5 5 0 000 10z" />
                                                </svg>
                                                Find & Replace
                                            </Button>
                                        )}
                                        {can('bulkEdit') && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setIsBulkEditMode(true)}
                                                className="gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                                Bulk Edit
                                            </Button>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        {selectedItems.size > 0 && (
                            <>
                                {can('printLabels') && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setQrModalOpen(true)}
                                    disabled={isGeneratingQR}
                                    className="gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                    </svg>
                                    {isGeneratingQR ? 'Generating…' : 'Print QR / Labels'}
                                </Button>
                                )}
                                {can('bulkDelete') && (
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={handleBulkDelete}
                                        disabled={isActionLoading}
                                        className="gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Delete
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            <PullToRefresh onRefresh={async () => { await refresh(); }}>
                {isActionLoading || isInventoryLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <Skeleton key={i} className="h-[280px] w-full rounded-2xl" />
                        ))}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {filteredItems.map((item) => {
                            const issue = getEquipmentIssue(item);

                            return (
                            <Link
                                key={item.id}
                                href={`/inventory/${item.barcode}`}
                                onClick={() => {
                                    const scroller = document.querySelector('.app-main-scroll');
                                    sessionStorage.setItem('inventoryScroll', String(scroller?.scrollTop ?? 0));
                                    sessionStorage.setItem('inventoryFlash', item.barcode);
                                }}
                                className="block h-full"
                            >
                                <div className={`group bg-white dark:bg-[#1c1c1e] rounded-xl p-4 border transition-all duration-700 cursor-pointer h-full flex flex-col ${item.barcode === flashBarcode ? 'border-primary/40 bg-primary/[0.06] ring-1 ring-inset ring-primary/30' : 'border-gray-100 dark:border-gray-800 hover:border-primary/30 hover:shadow-md'}`}>
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0 pr-6">
                                            {/* Composed names ("Wellborn NP F 970 Big Battery") are long, so wrap
                                                to two lines rather than truncating mid-word — and don't repeat
                                                the brand, model or size the name already contains. */}
                                            <div className="flex items-start gap-1.5 min-w-0">
                                                <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 break-words min-w-0 group-hover:text-primary transition-colors">
                                                    {item.name}
                                                </h3>
                                                {item.metadata?.size && !nameCovers(item, item.metadata.size) && (
                                                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-foreground/70 border border-border/60 whitespace-nowrap max-w-[6rem] truncate">
                                                        {item.metadata.size}
                                                    </span>
                                                )}
                                            </div>
                                            {(() => {
                                                const detail = itemDetailLineForRow(item);
                                                return detail ? (
                                                    <p className="text-[12px] font-medium text-foreground/75 truncate mt-0.5">{detail}</p>
                                                ) : null;
                                            })()}
                                        </div>
                                        <Badge
                                            variant={getDisplayStatusVariant(item)}
                                            className="text-[10px] font-medium px-2 py-0.5 rounded-md shrink-0"
                                        >
                                            {getDisplayStatus(item)}
                                        </Badge>
                                    </div>

                                    <div className="flex-1">
                                        {item.serialNumber && (
                                            <div className="mb-3">
                                                <span className="text-[11px] font-mono font-medium text-foreground/80 bg-secondary/80 px-1.5 py-0.5 rounded border border-border/50">
                                                    {item.serialNumber}
                                                </span>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-auto">
                                            <span>{item.category.trim().toLowerCase() === item.name.trim().toLowerCase() ? '' : item.category}</span>
                                            <span className="font-mono text-muted-foreground/60">{item.barcode}</span>
                                        </div>

                                        {issue && (
                                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold leading-snug text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                                <span className="block truncate">{getIssueSummary(issue)}</span>
                                                <span className="block truncate font-medium">{issue.note}</span>
                                            </div>
                                        )}
                                    </div>

                                    {item.status !== 'AVAILABLE' && item.assignedTo && (
                                        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-50 dark:border-gray-800 mt-auto">
                                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center">
                                                <span className="text-[8px] font-bold text-white">
                                                    {getUserName(item.assignedTo)?.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate">
                                                {getUserName(item.assignedTo)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </Link>
                            );
                        })}
                    </div>
                ) : (
                    <Card className="overflow-hidden border-border/50 bg-secondary/30">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3 w-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 rounded border-border accent-primary"
                                            />
                                        </th>
                                        <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('name')}>
                                            <div className="flex items-center whitespace-nowrap">Equipment Name <SortIcon active={sortConfig?.key === 'name'} direction={sortConfig?.direction || 'asc'} /></div>
                                        </th>
                                        <th className="px-6 py-3">Brand</th>
                                        <th className="px-6 py-3">Model</th>
                                        <th className="px-6 py-3">Size</th>
                                        <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('category')}>
                                            <div className="flex items-center">Category <SortIcon active={sortConfig?.key === 'category'} direction={sortConfig?.direction || 'asc'} /></div>
                                        </th>
                                        <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('barcode')}>
                                            <div className="flex items-center">Barcode <SortIcon active={sortConfig?.key === 'barcode'} direction={sortConfig?.direction || 'asc'} /></div>
                                        </th>
                                        <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('serialNumber')}>
                                            <div className="flex items-center whitespace-nowrap">S/N <SortIcon active={sortConfig?.key === 'serialNumber'} direction={sortConfig?.direction || 'asc'} /></div>
                                        </th>
                                        <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('status')}>
                                            <div className="flex items-center">Status <SortIcon active={sortConfig?.key === 'status'} direction={sortConfig?.direction || 'asc'} /></div>
                                        </th>
                                        <th className="px-6 py-3">
                                            <div className="flex items-center">Action</div>
                                        </th>
                                        <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('assignedToName')}>
                                            <div className="flex items-center">Assigned To <SortIcon active={sortConfig?.key === 'assignedToName'} direction={sortConfig?.direction || 'asc'} /></div>
                                        </th>
                                        <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('createdAt')}>
                                            <div className="flex items-center whitespace-nowrap">Added <SortIcon active={sortConfig?.key === 'createdAt'} direction={sortConfig?.direction || 'asc'} /></div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isInventoryLoading ? (
                                        Array.from({ length: 8 }).map((_, i) => (
                                            <tr key={i} className="border-b border-border bg-background/50">
                                                <td className="px-4 py-4"><Skeleton className="w-4 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-40 h-5 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-20 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-20 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-16 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-24 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-28 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-24 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-20 h-6 rounded-full" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-5 h-5 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-32 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-20 h-4 rounded" /></td>
                                            </tr>
                                        ))
                                    ) : (
                                        filteredItems.map((item) => {
                                            const issue = getEquipmentIssue(item);

                                            return (
                                            <tr
                                                key={item.id}
                                                onClick={() => {
                                                    if (isBulkEditMode) return;
                                                    // Don't navigate if the user is selecting text in the row.
                                                    if (typeof window !== 'undefined' && window.getSelection()?.toString()) return;
                                                    openItem(item.barcode);
                                                }}
                                                className={`border-b border-border transition-[background-color,box-shadow,border-color] duration-700 ${!isBulkEditMode && 'cursor-pointer hover:bg-secondary/50'} ${item.barcode === flashBarcode ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : selectedItems.has(item.id) ? 'bg-primary/5' : 'bg-background/50'}`}
                                            >
                                                <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItems.has(item.id)}
                                                        onChange={(e) => toggleSelect(e, item.id)}
                                                        className="w-4 h-4 rounded border-border accent-primary"
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    {isBulkEditMode ? (
                                                        <div className="w-40">
                                                            <InlineInput value={editDrafts[item.id]?.name ?? item.name} onChange={(val) => handleDraftChange(item.id, 'name', val)} placeholder="Name" />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="font-medium text-foreground">{item.name}</div>
                                                            {issue && (
                                                                <div className="mt-1 flex max-w-[320px] items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                                                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                                                    </svg>
                                                                    <span className="line-clamp-2">{getIssueSummary(issue)}: {issue.note}</span>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground">
                                                    {isBulkEditMode ? (
                                                        <div className="w-28"><InlineInput value={editDrafts[item.id]?.metadata?.brand ?? item.metadata?.brand ?? ''} onChange={(val) => handleMetadataDraftChange(item, 'brand', val)} placeholder="Brand" /></div>
                                                    ) : (item.metadata?.brand || '—')}
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground">
                                                    {isBulkEditMode ? (
                                                        <div className="w-28"><InlineInput value={editDrafts[item.id]?.metadata?.model ?? item.metadata?.model ?? ''} onChange={(val) => handleMetadataDraftChange(item, 'model', val)} placeholder="Model" /></div>
                                                    ) : (item.metadata?.model || '—')}
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground">
                                                    {isBulkEditMode ? (
                                                        <div className="w-24"><InlineInput value={editDrafts[item.id]?.metadata?.size ?? item.metadata?.size ?? ''} onChange={(val) => handleMetadataDraftChange(item, 'size', val)} placeholder="Size" /></div>
                                                    ) : (item.metadata?.size || '—')}
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground">
                                                    {isBulkEditMode ? (
                                                        <div className="w-32">
                                                            <InlineInput value={editDrafts[item.id]?.category ?? item.category} onChange={(val) => handleDraftChange(item.id, 'category', val)} placeholder="Category" />
                                                        </div>
                                                    ) : item.category}
                                                </td>
                                                <td className="px-6 py-4 font-mono text-muted-foreground">
                                                    {isBulkEditMode ? (
                                                        <div className="w-32">
                                                            <InlineInput value={editDrafts[item.id]?.barcode ?? item.barcode} onChange={(val) => handleDraftChange(item.id, 'barcode', val)} placeholder="Barcode" />
                                                        </div>
                                                    ) : item.barcode}
                                                </td>
                                                <td className="px-6 py-4 font-mono text-muted-foreground">
                                                    {isBulkEditMode ? (
                                                        <div className="w-28"><InlineInput value={editDrafts[item.id]?.serialNumber ?? item.serialNumber ?? ''} onChange={(val) => handleDraftChange(item.id, 'serialNumber', val)} placeholder="S/N" /></div>
                                                    ) : (item.serialNumber || '—')}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant={getDisplayStatusVariant(item)}>
                                                        {getDisplayStatus(item)}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={(e) => handlePrintQR(e, item)}
                                                        className="text-primary hover:text-primary/80 transition-colors"
                                                        title="Print QR"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                        </svg>
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground">{item.status !== 'AVAILABLE' ? (getUserName(item.assignedTo) || '-') : '-'}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                                                    {(item.createdAt || item.lastActivity)
                                                        ? new Date(item.createdAt || item.lastActivity!).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                                                        : '—'}
                                                </td>
                                            </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                {filteredItems.length === 0 && !isInventoryLoading && (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-[#1c1c1e] rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                        <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No items found</h3>
                        <p className="text-gray-500 mt-1 mb-6 max-w-sm">
                            We could not find any items matching your current filters. Try adjusting your search criteria.
                        </p>
                        {(search || statusFilter !== 'ALL' || categoryFilter.length > 0 || brandFilter.length > 0 || sizeFilter.length > 0 || endFilter.length > 0) && (
                            <Button
                                variant="outline"
                                onClick={() => { setSearch(''); setStatusFilter('ALL'); setCategoryFilter([]); setBrandFilter([]); setSizeFilter([]); setEndFilter([]); }}
                                className="bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800"
                            >
                                Clear all filters
                            </Button>
                        )}
                    </div>
                )}
            </PullToRefresh>

            {/* QR / Label options dialog — choose what to print before downloading */}
            {/* Normalize Connectors dialog */}
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
