'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Equipment, EquipmentStatus } from '@/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { downloadFile } from '@/lib/download';
import { Badge } from '@/components/Badge';
import { MobileScanner, QRScanner } from '@/components/QRScanner';
import { useAuth } from '@/lib/auth';
import { ScanLine, Search } from 'lucide-react';
import { PullToRefresh } from '@/components/PullToRefresh';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/dialog-context';
import { Skeleton } from '@/components/Skeleton';
import { useEquipment, useUpdateEquipment, useDeleteEquipment } from '@/hooks/useEquipment';
import { useUsers } from '@/hooks/useUsers';
import { useTransactions } from '@/hooks/useTransactions';
import { getEquipmentIssue, getIssueSummary, hasEquipmentIssue } from '@/lib/equipment-issues';

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

        const isConfirmed = await confirm({
            title: 'Fix Data Inconsistencies?',
            message: `Found ${totalIssues} issues:\n` +
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
    const [search, setSearch] = useState('');
    const [showInventoryScanner, setShowInventoryScanner] = useState(false);
    const searchParams = useSearchParams();
    const [statusFilter, setStatusFilter] = useState<EquipmentStatus | 'ALL' | 'NEEDS_ATTENTION'>(() => {
        const statusParam = searchParams.get('status');
        if (statusParam && ['ALL', 'AVAILABLE', 'CHECKED_OUT', 'PENDING_VERIFICATION', 'NEEDS_ATTENTION'].includes(statusParam)) {
            return statusParam as EquipmentStatus | 'ALL' | 'NEEDS_ATTENTION';
        }
        return 'ALL';
    });
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
        if (typeof window !== 'undefined') {
            return (sessionStorage.getItem('inventoryViewMode') as 'grid' | 'list') || 'grid';
        }
        return 'grid';
    });
    const [sortConfig, setSortConfig] = useState<{ key: keyof Equipment | 'assignedToName'; direction: 'asc' | 'desc' } | null>(null);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [isGeneratingQR, setIsGeneratingQR] = useState(false);
    // Local loading state for non-query async actions if needed, though query handles most
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [isBulkEditMode, setIsBulkEditMode] = useState(false);
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

    useEffect(() => {
        sessionStorage.setItem('inventoryViewMode', viewMode);
    }, [viewMode]);

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
        let result = items;

        // NOTE: Department filtering is already done at the Supabase query level in useEquipment().
        // No need to re-filter by department here — it would cause items to appear empty
        // if item.departmentId isn't mapped correctly.

        if (search) {
            const normalize = (str: string) => str.toLowerCase().replace(/[\s\-_]/g, '');
            const normalizedQ = normalize(search);
            const basicQ = search.toLowerCase().trim();
            result = result.filter(item =>
                item.name.toLowerCase().includes(basicQ) ||
                item.category.toLowerCase().includes(basicQ) ||
                normalize(item.barcode).includes(normalizedQ) ||
                (item.serialNumber && normalize(item.serialNumber).includes(normalizedQ)) ||
                normalize(item.name).includes(normalizedQ)
            );
        }

        if (statusFilter !== 'ALL') {
            if (statusFilter === 'NEEDS_ATTENTION') {
                result = result.filter(item => ['MAINTENANCE', 'DAMAGED', 'LOST'].includes(item.status) || hasEquipmentIssue(item));
            } else {
                result = result.filter(item => item.status === statusFilter);
            }
        }

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aValue: string | number | null | undefined = a[sortConfig.key as keyof Equipment] as string | number | null | undefined;
                let bValue: string | number | null | undefined = b[sortConfig.key as keyof Equipment] as string | number | null | undefined;

                if (sortConfig.key === 'assignedToName') {
                    aValue = getUserName(a.assignedTo) || '';
                    bValue = getUserName(b.assignedTo) || '';
                }

                const valA = (aValue ?? '').toString().toLowerCase();
                const valB = (bValue ?? '').toString().toLowerCase();

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [items, search, statusFilter, sortConfig, getUserName]);

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
        try {
            const qrModule = await import('qrcode');
            const QRCode = qrModule.default || qrModule;
            const pdfModule = await import('jspdf');
            const jsPDF = pdfModule.jsPDF || pdfModule.default;

            if (!jsPDF) throw new Error('jsPDF not loaded');

            const qrUrl = await QRCode.toDataURL(item.barcode, { width: 400, margin: 2 });

            const pdf = new jsPDF({ orientation: 'landscape', format: [100, 60], unit: 'mm' });

            pdf.setFontSize(14);
            pdf.text(item.name.substring(0, 30), 5, 8);

            pdf.addImage(qrUrl, 'PNG', 25, 12, 50, 40);

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

        const isConfirmed = await confirm({
            title: `Delete Selected Item${selectedItems.size !== 1 ? 's' : ''}?`,
            message: `Are you sure you want to delete ${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''}? This action cannot be undone.`,
            confirmLabel: 'Delete Forever',
            variant: 'danger'
        });

        if (!isConfirmed) return;

        setIsActionLoading(true);
        try {
            await deleteEquipment(Array.from(selectedItems));
            showToast(`Successfully deleted ${selectedItems.size} items`, 'success');
            setSelectedItems(new Set());
        } catch (error) {
            console.error('Delete failed:', error);
            showToast('Failed to delete items', 'error');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleBulkDownloadQR = async (size: 'standard' | 'small') => {
        if (isGeneratingQR) return;

        if (selectedItems.size === 0) {
            alert('Please select at least one item');
            return;
        }

        setIsGeneratingQR(true);
        try {
            const qrModule = await import('qrcode');
            const QRCode = qrModule.default || qrModule;
            const pdfModule = await import('jspdf');
            const jsPDF = pdfModule.jsPDF || pdfModule.default;

            if (!jsPDF) throw new Error('jsPDF not loaded');

            const pdf = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
            const pageWidth = 210;
            const pageHeight = 297;

            // Configuration based on size
            const isSmall = size === 'small';
            const cols = isSmall ? 7 : 4;
            const rows = isSmall ? 9 : 5;
            const qrSize = isSmall ? 16 : 32; // ~50% reduction
            const fontSize = isSmall ? 6 : 9;
            const serialFontSize = isSmall ? 7 : 10;

            const cellWidth = pageWidth / cols;
            const cellHeight = (pageHeight - 20) / rows;
            const marginTop = 10;

            // Calculate offsets to center content in cell
            // Content width = serialWidth (approx 5mm) + qrSize
            const serialWidth = isSmall ? 4 : 6;
            const contentWidth = serialWidth + qrSize;
            const marginLeft = (cellWidth - contentWidth) / 2;

            const selectedItemsArray = items.filter(item => selectedItems.has(item.id));
            const itemsPerPage = cols * rows;

            for (let i = 0; i < selectedItemsArray.length; i++) {
                const item = selectedItemsArray[i];
                const positionOnPage = i % itemsPerPage;
                const row = Math.floor(positionOnPage / cols);
                const col = positionOnPage % cols;

                if (positionOnPage === 0 && i > 0) {
                    pdf.addPage();
                }

                const cellX = col * cellWidth;
                const cellY = marginTop + row * cellHeight;

                // Center everything vertically in the cell
                // QR Height + Barcode Text Height approx qrSize + 5
                const contentHeight = qrSize + 5;
                const startY = cellY + (cellHeight - contentHeight) / 2;

                // 1. Draw Serial Number (Rotated 90deg on the left)
                if (item.serialNumber) {
                    // Check if text fits in the height provided (qrSize)
                    pdf.setFont('helvetica', 'bold');
                    let currentFontSize = serialFontSize;
                    pdf.setFontSize(currentFontSize);

                    const textWidth = pdf.getTextWidth(item.serialNumber);
                    const availableHeight = qrSize; // It's rotated, so width matches height constraint

                    if (textWidth > availableHeight) {
                        // Scale down to fit
                        currentFontSize = Math.floor(currentFontSize * (availableHeight / textWidth) * 10) / 10;
                        // Set hard minimums
                        const minSize = isSmall ? 3 : 4;
                        if (currentFontSize < minSize) currentFontSize = minSize;
                        pdf.setFontSize(currentFontSize);
                    }

                    // Position: Left of QR, vertically centered relative to QR
                    const serialX = cellX + marginLeft + 2;
                    const serialY = startY + qrSize; // align bottom with QR bottom
                    pdf.text(item.serialNumber, serialX, serialY, { angle: 90 });
                }

                // 2. Draw QR Code
                const qrX = cellX + marginLeft + serialWidth;
                const qrY = startY;
                const qrUrl = await QRCode.toDataURL(item.barcode, { width: 300, margin: 1 });
                pdf.addImage(qrUrl, 'PNG', qrX, qrY, qrSize, qrSize);

                // 3. Draw Barcode Text (Below QR)
                pdf.setFontSize(fontSize);
                pdf.setFont('helvetica', 'normal');
                // Center text relative to the QR code
                const textX = qrX + (qrSize / 2);
                const textY = qrY + qrSize + (isSmall ? 3 : 4);
                pdf.text(item.barcode, textX, textY, { align: 'center' });
            }

            downloadFile(pdf.output('blob'), `QR_Codes_${size}_${selectedItems.size}_items.pdf`, 'application/pdf');
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
                                {(cleanupData.staleAssignments.length > 0 || cleanupData.ghostCheckouts.length > 0) && ['ADMIN', 'SUPER_ADMIN'].includes(user.role) && (
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
                <div className="flex h-14 w-full items-center gap-2 rounded-2xl border border-border bg-secondary/50 px-3 transition-all duration-200 focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary">
                    <Search className="h-5 w-5 shrink-0 text-muted-foreground sm:h-6 sm:w-6" />
                    <input
                        type="search"
                        placeholder="Search name, barcode, serial..."
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

                        <div className="md:hidden h-[360px] max-h-[52vh] min-h-[280px] overflow-hidden rounded-[24px] bg-black shadow-[0_16px_40px_-16px_rgba(0,0,0,0.55)]">
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

                <div className="w-full overflow-hidden -mx-3 px-3">
                    <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-hide">
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
                        {['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user?.role || '') && (
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
                                                const draftIds = Object.keys(editDrafts);
                                                if (draftIds.length === 0) {
                                                    setIsBulkEditMode(false);
                                                    return;
                                                }
                                                setIsSavingDrafts(true);
                                                let hasError = false;
                                                for (const id of draftIds) {
                                                    try {
                                                        await updateEquipment({ id, updates: editDrafts[id] });
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
                        {selectedItems.size > 0 && (
                            <>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleBulkDownloadQR('standard')}
                                    disabled={isGeneratingQR}
                                    className="gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                    </svg>
                                    Standard QR
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleBulkDownloadQR('small')}
                                    disabled={isGeneratingQR}
                                    className="gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Small QR
                                </Button>
                                {['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') && (
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
                            <Link key={item.id} href={`/inventory/${item.barcode}`} className="block h-full">
                                <div className="group bg-white dark:bg-[#1c1c1e] rounded-xl p-4 border border-gray-100 dark:border-gray-800 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer h-full flex flex-col">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0 pr-6">
                                            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-primary transition-colors">
                                                {item.name}
                                            </h3>
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
                                            <span>{item.category}</span>
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
                                            <div className="flex items-center">Name <SortIcon active={sortConfig?.key === 'name'} direction={sortConfig?.direction || 'asc'} /></div>
                                        </th>
                                        <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('category')}>
                                            <div className="flex items-center">Category <SortIcon active={sortConfig?.key === 'category'} direction={sortConfig?.direction || 'asc'} /></div>
                                        </th>
                                        <th className="px-6 py-3 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('barcode')}>
                                            <div className="flex items-center">Barcode <SortIcon active={sortConfig?.key === 'barcode'} direction={sortConfig?.direction || 'asc'} /></div>
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
                                    </tr>
                                </thead>
                                <tbody>
                                    {isInventoryLoading ? (
                                        Array.from({ length: 8 }).map((_, i) => (
                                            <tr key={i} className="border-b border-border bg-background/50">
                                                <td className="px-4 py-4"><Skeleton className="w-4 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-48 h-5 rounded" /><Skeleton className="w-24 h-3 mt-1 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-24 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-28 h-4 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-20 h-6 rounded-full" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-5 h-5 rounded" /></td>
                                                <td className="px-6 py-4"><Skeleton className="w-32 h-4 rounded" /></td>
                                            </tr>
                                        ))
                                    ) : (
                                        filteredItems.map((item) => {
                                            const issue = getEquipmentIssue(item);

                                            return (
                                            <tr
                                                key={item.id}
                                                onClick={() => {
                                                    if (!isBulkEditMode) {
                                                        router.push(`/inventory/${item.barcode}`);
                                                    }
                                                }}
                                                className={`border-b border-border transition-colors ${!isBulkEditMode && 'cursor-pointer hover:bg-secondary/50'} ${selectedItems.has(item.id) ? 'bg-primary/5' : 'bg-background/50'}`}
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
                                                        <div className="flex flex-col gap-1 w-48">
                                                            <InlineInput value={editDrafts[item.id]?.name ?? item.name} onChange={(val) => handleDraftChange(item.id, 'name', val)} placeholder="Name" />
                                                            <InlineInput value={editDrafts[item.id]?.serialNumber ?? item.serialNumber ?? ''} onChange={(val) => handleDraftChange(item.id, 'serialNumber', val)} placeholder="S/N (Optional)" />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="font-medium text-foreground">{item.name}</div>
                                                            {item.serialNumber && <div className="text-xs text-muted-foreground font-mono mt-0.5">{item.serialNumber}</div>}
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
                        {(search || statusFilter !== 'ALL') && (
                            <Button
                                variant="outline"
                                onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
                                className="bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800"
                            >
                                Clear all filters
                            </Button>
                        )}
                    </div>
                )}
            </PullToRefresh>
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
