'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ScanLine } from 'lucide-react';
import { storage } from '@/lib/storage';
import { Condition, Equipment, ManualTransactionItem, Shoot, Transaction, User } from '@/types';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';
import { MobileScanner, QRScanner } from '@/components/QRScanner';
import {
    CONDITION_LABELS,
    conditionToIssueSeverity,
    conditionToIssueType,
    getEquipmentIssue,
    getIssueSummary,
    isIssueCondition,
    withActiveIssue,
} from '@/lib/equipment-issues';
import { areManualItemsComplete, decodeTransactionNotes } from '@/lib/transaction-manual-items';
import { itemDetailLine } from '@/components/ItemIdentity';

type SortField = 'item' | 'project' | 'user' | 'date';
type SortDirection = 'asc' | 'desc';
type IssueDialogMode = 'AVAILABLE_WITH_ISSUE' | 'MAINTENANCE';
type PendingManualItem = {
    transaction: Transaction;
    item: ManualTransactionItem;
    key: string;
};
type VerificationGroup = {
    key: string;
    title: string;
    txnId: string;
    date: string;
    timestamp: number;
    transactionIds: string[];
    items: Equipment[];
    manualItems: PendingManualItem[];
    notes: Array<{
        transactionId: string;
        label: string;
        text: string;
    }>;
};

import { Skeleton } from '@/components/Skeleton';

export default function VerificationPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { showToast } = useToast();
    const { department } = useDepartment();
    const labels = getDepartmentLabels(department);

    // Enforce department isolation: regular users see only their dept
    const effectiveDeptId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);
    const [isLoading, setIsLoading] = useState(true); // Data loading state
    const [pendingItems, setPendingItems] = useState<Equipment[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [shoots, setShoots] = useState<Shoot[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [showVerificationScanner, setShowVerificationScanner] = useState(false);
    const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
        if (typeof window !== 'undefined') {
            return (sessionStorage.getItem('verificationViewMode') as 'card' | 'table') || 'card';
        }
        return 'card';
    });

    useEffect(() => {
        sessionStorage.setItem('verificationViewMode', viewMode);
    }, [viewMode]);

    // Selection state
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [issueDialog, setIssueDialog] = useState<{
        mode: IssueDialogMode;
        itemIds: string[];
        note: string;
    } | null>(null);

    // Sorting state
    const [sortField, setSortField] = useState<SortField>('item');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const loadItems = React.useCallback(async () => {
        // Removed setIsLoading(true) to allow seamless updates
        try {
            const items = await storage.getEquipment(effectiveDeptId);
            const txns = await storage.getTransactions(undefined, undefined, undefined, undefined, undefined, undefined, effectiveDeptId);
            const usersList = await storage.getUsers(effectiveDeptId);
            const shootsList = await storage.getShoots(effectiveDeptId);

            setPendingItems(items.filter(i => i.status === 'PENDING_VERIFICATION'));
            setTransactions(txns);
            setUsers(usersList);
            setShoots(shootsList);
        } catch (error) {
            console.error("Failed to load items", error);
        } finally {
            setIsLoading(false);
        }
    }, [effectiveDeptId]);

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            router.replace('/login');
            return;
        }

        if (!['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            router.replace('/');
            return;
        }
        loadItems();
    }, [user, router, loadItems, authLoading]);

    const getUserName = React.useCallback((userId?: string) => {
        if (!userId) return 'Unknown';
        const foundUser = users.find(u => u.id === userId);
        return foundUser ? (foundUser.name || foundUser.email || 'Unknown') : 'Unknown';
    }, [users]);

    const getItemTransaction = React.useCallback((itemId: string) => {
        return transactions.find(t => t.items.includes(itemId));
    }, [transactions]);

    const formatTxnId = React.useCallback((id: string) => {
        if (id.startsWith('TXN-')) return id;
        return `TXN-${id.substring(0, 6).toUpperCase()}`;
    }, []);

    const formatDate = React.useCallback((dateString?: string) => {
        if (!dateString) return 'Today';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }, []);

    const compareByName = React.useCallback((a: Equipment, b: Equipment) => {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    }, []);

    const parseVerificationScanCode = (decodedText: string) => {
        try {
            const data = JSON.parse(decodedText);
            return String(data.barcode || data.id || decodedText).trim();
        } catch {
            return decodedText.trim();
        }
    };

    const normalizeSearch = React.useCallback((value?: string | number | null) => {
        return String(value ?? '').toLowerCase().trim();
    }, []);

    const textMatchesSearch = React.useCallback((query: string, values: Array<string | number | null | undefined>) => {
        if (!query) return true;
        return values.some(value => normalizeSearch(value).includes(query));
    }, [normalizeSearch]);

    const getCleanTransactionNotes = React.useCallback((txn?: Transaction) => {
        return decodeTransactionNotes(txn?.notes).notes || '';
    }, []);

    const itemMatchesSearch = React.useCallback((item: Equipment, query: string) => {
        if (!query) return true;

        const txn = getItemTransaction(item.id);
        const activeIssue = getEquipmentIssue(item);

        return textMatchesSearch(query, [
            item.name,
            item.barcode,
            item.serialNumber,
            item.category,
            item.location,
            item.condition,
            CONDITION_LABELS[item.condition],
            activeIssue ? getIssueSummary(activeIssue) : '',
            activeIssue?.note,
            txn?.project,
            getCleanTransactionNotes(txn),
            txn?.id,
            txn ? formatTxnId(txn.id) : '',
            getUserName(item.assignedTo),
            item.lastActivity,
        ]);
    }, [formatTxnId, getCleanTransactionNotes, getItemTransaction, getUserName, textMatchesSearch]);

    const manualItemMatchesSearch = React.useCallback((row: PendingManualItem, query: string) => {
        if (!query) return true;

        return textMatchesSearch(query, [
            row.item.name,
            row.item.notes,
            row.item.returnNote,
            row.item.status,
            row.transaction.project,
            getCleanTransactionNotes(row.transaction),
            row.transaction.id,
            formatTxnId(row.transaction.id),
            getUserName(row.transaction.userId),
            row.transaction.timestampOut,
            row.transaction.timestampIn,
        ]);
    }, [formatTxnId, getCleanTransactionNotes, getUserName, textMatchesSearch]);

    // Sorted items for table view
    const sortedItems = useMemo(() => {
        return [...pendingItems].sort((a, b) => {
            const txnA = getItemTransaction(a.id);
            const txnB = getItemTransaction(b.id);

            let comparison = 0;

            switch (sortField) {
                case 'item':
                    comparison = compareByName(a, b);
                    break;
                case 'project':
                    const projA = txnA?.project || 'Unspecified';
                    const projB = txnB?.project || 'Unspecified';
                    comparison = projA.localeCompare(projB);
                    break;
                case 'user':
                    const userA = getUserName(a.assignedTo);
                    const userB = getUserName(b.assignedTo);
                    comparison = userA.localeCompare(userB);
                    break;
                case 'date':
                    const dateA = new Date(a.lastActivity || 0).getTime();
                    const dateB = new Date(b.lastActivity || 0).getTime();
                    comparison = dateA - dateB;
                    break;
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [pendingItems, sortField, sortDirection, getItemTransaction, getUserName, compareByName]);

    const pendingManualItems = useMemo<PendingManualItem[]>(() => {
        return transactions
            .filter(txn => txn.status === 'OPEN')
            .flatMap(txn => (txn.manualItems || [])
                .filter(item => item.status === 'PENDING_VERIFICATION')
                .map(item => ({ transaction: txn, item, key: `${txn.id}:${item.id}` }))
            )
            .sort((a, b) => a.item.name.localeCompare(b.item.name, undefined, { sensitivity: 'base', numeric: true }));
    }, [transactions]);

    const verificationGroups = useMemo<VerificationGroup[]>(() => {
        const groups: Record<string, VerificationGroup> = {};

        const getGroupForTransaction = (txn?: Transaction, fallbackDate?: string) => {
            const linkedShoot = txn?.shootId ? shoots.find(shoot => shoot.id === txn.shootId) : undefined;
            const key = linkedShoot ? `shoot:${linkedShoot.id}` : txn ? `transaction:${txn.id}` : 'unlinked';
            const shootPrefix = linkedShoot?.shootNumber ? `#${linkedShoot.shootNumber} ` : '';
            const title = linkedShoot
                ? `${shootPrefix}${linkedShoot.title}`
                : txn?.project && txn.project.trim() !== ''
                    ? txn.project
                    : 'General Return';
            const timestampSource = fallbackDate || txn?.timestampIn || linkedShoot?.startTime || txn?.timestampOut;
            const timestamp = new Date(timestampSource || 0).getTime();

            if (!groups[key]) {
                groups[key] = {
                    key,
                    title,
                    txnId: txn ? formatTxnId(txn.id) : '',
                    date: formatDate(timestampSource),
                    timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
                    transactionIds: [],
                    items: [],
                    manualItems: [],
                    notes: [],
                };
            }

            if (txn && !groups[key].transactionIds.includes(txn.id)) {
                groups[key].transactionIds.push(txn.id);
            }

            if (txn) {
                const cleanNotes = getCleanTransactionNotes(txn);
                if (cleanNotes && !groups[key].notes.some(note => note.transactionId === txn.id)) {
                    groups[key].notes.push({
                        transactionId: txn.id,
                        label: formatTxnId(txn.id),
                        text: cleanNotes,
                    });
                }
            }

            if (!Number.isNaN(timestamp) && timestamp > groups[key].timestamp) {
                groups[key].timestamp = timestamp;
                groups[key].date = formatDate(timestampSource);
            }

            return groups[key];
        };

        pendingItems.forEach(item => {
            const txn = getItemTransaction(item.id);
            getGroupForTransaction(txn, item.lastActivity).items.push(item);
        });

        pendingManualItems.forEach(row => {
            getGroupForTransaction(row.transaction, row.item.returnedAt || row.transaction.timestampIn).manualItems.push(row);
        });

        return Object.values(groups)
            .map(group => ({
                ...group,
                items: [...group.items].sort(compareByName),
                manualItems: [...group.manualItems].sort((a, b) =>
                    a.item.name.localeCompare(b.item.name, undefined, { sensitivity: 'base', numeric: true })
                ),
            }))
            .sort((a, b) => {
                const dateComparison = b.timestamp - a.timestamp;
                if (dateComparison !== 0) return dateComparison;
                return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
            });
    }, [pendingItems, pendingManualItems, shoots, getItemTransaction, getCleanTransactionNotes, formatTxnId, formatDate, compareByName]);

    const normalizedSearchQuery = useMemo(() => normalizeSearch(searchQuery), [normalizeSearch, searchQuery]);

    const filteredPendingItems = useMemo(() => {
        if (!normalizedSearchQuery) return pendingItems;
        return pendingItems.filter(item => itemMatchesSearch(item, normalizedSearchQuery));
    }, [itemMatchesSearch, normalizedSearchQuery, pendingItems]);

    const filteredPendingManualItems = useMemo(() => {
        if (!normalizedSearchQuery) return pendingManualItems;
        return pendingManualItems.filter(row => manualItemMatchesSearch(row, normalizedSearchQuery));
    }, [manualItemMatchesSearch, normalizedSearchQuery, pendingManualItems]);

    const filteredVerificationGroups = useMemo<VerificationGroup[]>(() => {
        if (!normalizedSearchQuery) return verificationGroups;

        return verificationGroups
            .map(group => {
                const groupMatches = textMatchesSearch(normalizedSearchQuery, [
                    group.title,
                    group.txnId,
                    group.date,
                    ...group.transactionIds,
                    ...group.transactionIds.map(id => formatTxnId(id)),
                    ...group.notes.map(note => note.text),
                ]);

                const items = groupMatches
                    ? group.items
                    : group.items.filter(item => itemMatchesSearch(item, normalizedSearchQuery));
                const manualItems = groupMatches
                    ? group.manualItems
                    : group.manualItems.filter(row => manualItemMatchesSearch(row, normalizedSearchQuery));

                return {
                    ...group,
                    items,
                    manualItems,
                };
            })
            .filter(group => group.items.length > 0 || group.manualItems.length > 0);
    }, [formatTxnId, itemMatchesSearch, manualItemMatchesSearch, normalizedSearchQuery, textMatchesSearch, verificationGroups]);

    const visibleSortedItems = useMemo(() => {
        if (!normalizedSearchQuery) return sortedItems;
        const visibleIds = new Set(filteredPendingItems.map(item => item.id));
        return sortedItems.filter(item => visibleIds.has(item.id));
    }, [filteredPendingItems, normalizedSearchQuery, sortedItems]);

    useEffect(() => {
        setExpandedGroups(prev => {
            const activeGroups = normalizedSearchQuery ? filteredVerificationGroups : verificationGroups;
            const validKeys = new Set(activeGroups.map(group => group.key));
            const next = new Set([...prev].filter(key => validKeys.has(key)));
            if (normalizedSearchQuery) {
                activeGroups.forEach(group => next.add(group.key));
            } else if (activeGroups.length === 1) {
                next.add(activeGroups[0].key);
            }
            return next;
        });
    }, [filteredVerificationGroups, normalizedSearchQuery, verificationGroups]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Selection handlers
    const toggleItemSelection = (itemId: string) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(itemId)) {
            newSelected.delete(itemId);
        } else {
            newSelected.add(itemId);
        }
        setSelectedItems(newSelected);
    };

    const toggleGroupSelection = (items: Equipment[]) => {
        const newSelected = new Set(selectedItems);
        const allSelected = items.every(i => newSelected.has(i.id));

        if (allSelected) {
            items.forEach(i => newSelected.delete(i.id));
        } else {
            items.forEach(i => newSelected.add(i.id));
        }
        setSelectedItems(newSelected);
    };

    const selectAll = () => {
        const visibleItemIds = filteredPendingItems.map(item => item.id);
        const allVisibleSelected = visibleItemIds.length > 0 && visibleItemIds.every(id => selectedItems.has(id));

        if (allVisibleSelected) {
            const next = new Set(selectedItems);
            visibleItemIds.forEach(id => next.delete(id));
            setSelectedItems(next);
        } else {
            setSelectedItems(new Set([...selectedItems, ...visibleItemIds]));
        }
    };

    const clearSelection = () => {
        setSelectedItems(new Set());
    };

    const toggleGroupExpanded = (groupKey: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) {
                next.delete(groupKey);
            } else {
                next.add(groupKey);
            }
            return next;
        });
    };

    const handleVerificationScan = (decodedText: string) => {
        const code = parseVerificationScanCode(decodedText);
        if (!code) return;

        setSearchQuery(code);
        setShowVerificationScanner(false);
    };

    const handleVerify = async (
        id: string,
        status: 'AVAILABLE' | 'DAMAGED' | 'MAINTENANCE',
        options?: {
            issueNote?: string;
            issueCondition?: Condition;
            keepAvailableWithIssue?: boolean;
        }
    ) => {
        try {
            const items = await storage.getEquipment(effectiveDeptId);
            const item = items.find(i => i.id === id);

            if (!item) {
                showToast('Item not found', 'error');
                return;
            }

            const issueCondition = options?.issueCondition || (isIssueCondition(item.condition) ? item.condition : 'DAMAGED');
            const cleanVerify = status === 'AVAILABLE' && !options?.keepAvailableWithIssue;
            const activeIssue = options?.issueNote?.trim()
                ? {
                    condition: issueCondition,
                    issueType: conditionToIssueType(issueCondition),
                    severity: conditionToIssueSeverity(issueCondition),
                    note: options.issueNote.trim(),
                    source: 'verification' as const,
                    reportedAt: getEquipmentIssue(item)?.reportedAt || new Date().toISOString(),
                    reportedBy: getEquipmentIssue(item)?.reportedBy,
                    reporterName: getEquipmentIssue(item)?.reporterName,
                    verifiedAt: new Date().toISOString(),
                    verifiedBy: user?.id,
                }
                : null;
            const nextCondition: Condition = cleanVerify ? 'OK' : issueCondition;

            // 1. Update Equipment Status
            await storage.updateEquipment(id, {
                status,
                condition: nextCondition,
                assignedTo: null as unknown as string,
                lastActivity: new Date().toISOString(),
                metadata: withActiveIssue(item.metadata, activeIssue)
            });

            // 2. Find and Update Transaction
            const allTransactions = await storage.getTransactions(undefined, undefined, undefined, undefined, undefined, undefined, effectiveDeptId);
            const relatedTransaction = allTransactions.find(
                t => t.status === 'OPEN' && t.items.includes(id)
            );

            if (user) {
                const projectText = relatedTransaction ? ` for project "${relatedTransaction.project || 'Unspecified'}"` : '';
                const issueText = activeIssue ? `, Issue: ${getIssueSummary(activeIssue)} - ${activeIssue.note}` : '';
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'VERIFY',
                    entityId: id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Verified item "${item.name}" (${item.barcode}) as ${status}${issueText}${projectText}`,
                    departmentId: effectiveDeptId || undefined
                });
            }

            if (relatedTransaction) {
                const currentConditions = relatedTransaction.postReturnConditions || {};
                const conditionToRecord = cleanVerify ? 'OK' : nextCondition;

                const updatedConditions = {
                    ...currentConditions,
                    [id]: conditionToRecord
                };

                const allItemsReturned = relatedTransaction.items.every(itemId =>
                    updatedConditions[itemId] !== undefined
                ) && areManualItemsComplete(relatedTransaction.manualItems);

                const txnUpdates: Partial<Transaction> = {
                    postReturnConditions: updatedConditions
                };

                if (allItemsReturned) {
                    txnUpdates.status = 'CLOSED';
                    txnUpdates.timestampIn = new Date().toISOString();
                }

                await storage.updateTransaction(relatedTransaction.id, txnUpdates);

                if (allItemsReturned) {
                    if (user) {
                        await storage.addLog({
                            id: crypto.randomUUID(),
                            action: 'EDIT',
                            entityId: relatedTransaction.id,
                            userId: user.id,
                            timestamp: new Date().toISOString(),
                            details: `Transaction automatically closed - all items returned and verified`,
                        });
                    }
                    showToast(`Item verified! Transaction closed.`, 'success');
                } else {
                    showToast('Item verified successfully!', 'success');
                }
            } else {
                showToast('Item verified successfully', 'success');
            }

            loadItems();
        } catch (error) {
            console.error('Error verifying item:', error);
            showToast('Failed to verify item', 'error');
        }
    };

    const handleBulkVerify = async (status: 'AVAILABLE' | 'DAMAGED' | 'MAINTENANCE') => {
        if (selectedItems.size === 0) return;

        const count = selectedItems.size;
        for (const itemId of selectedItems) {
            await handleVerify(itemId, status);
        }

        clearSelection();
        showToast(`Verified ${count} items`, 'success');
    };

    const handleVerifyManualItem = async (row: PendingManualItem, status: 'RETURNED' | 'MISSING') => {
        try {
            const updatedManualItems = (row.transaction.manualItems || []).map(item =>
                item.id === row.item.id
                    ? {
                        ...item,
                        status,
                        verifiedAt: new Date().toISOString(),
                        verifiedBy: user?.id,
                    }
                    : item
            );

            const inventoryComplete = row.transaction.items.every(itemId =>
                row.transaction.postReturnConditions?.[itemId] !== undefined
            );
            const txnUpdates: Partial<Transaction> = {
                manualItems: updatedManualItems
            };

            if (inventoryComplete && areManualItemsComplete(updatedManualItems)) {
                txnUpdates.status = 'CLOSED';
                txnUpdates.timestampIn = new Date().toISOString();
            }

            await storage.updateTransaction(row.transaction.id, txnUpdates);

            if (user) {
                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'VERIFY',
                    entityId: row.transaction.id,
                    userId: user.id,
                    timestamp: new Date().toISOString(),
                    details: `Verified manual item "${row.item.name}" as ${status.toLowerCase()}`,
                    departmentId: effectiveDeptId || undefined
                });
            }

            await loadItems();
            showToast(`Manual item marked ${status.toLowerCase()}`, 'success');
        } catch (error) {
            console.error('Failed to verify manual item', error);
            showToast('Failed to verify manual item', 'error');
        }
    };

    const openIssueDialog = (itemIds: string[], mode: IssueDialogMode) => {
        if (itemIds.length === 0) return;

        const firstItem = pendingItems.find(item => item.id === itemIds[0]);
        const existingIssue = getEquipmentIssue(firstItem);
        setIssueDialog({
            mode,
            itemIds,
            note: existingIssue?.note || '',
        });
    };

    const handleIssueDialogSubmit = async () => {
        if (!issueDialog) return;

        const note = issueDialog.note.trim();
        if (!note) {
            showToast('Add an issue note before continuing', 'warning');
            return;
        }

        const status = issueDialog.mode === 'MAINTENANCE' ? 'MAINTENANCE' : 'AVAILABLE';

        for (const itemId of issueDialog.itemIds) {
            const item = pendingItems.find(i => i.id === itemId);
            await handleVerify(itemId, status, {
                issueNote: note,
                issueCondition: item && isIssueCondition(item.condition) ? item.condition : (issueDialog.mode === 'MAINTENANCE' ? 'NOT_FUNCTIONING' : 'DAMAGED'),
                keepAvailableWithIssue: issueDialog.mode === 'AVAILABLE_WITH_ISSUE',
            });
        }

        showToast(
            issueDialog.mode === 'MAINTENANCE'
                ? `Sent ${issueDialog.itemIds.length} item${issueDialog.itemIds.length !== 1 ? 's' : ''} to maintenance`
                : `Marked ${issueDialog.itemIds.length} item${issueDialog.itemIds.length !== 1 ? 's' : ''} available with issue`,
            'success'
        );
        setIssueDialog(null);
        clearSelection();
    };

    const selectionMode = selectedItems.size > 0;

    const renderVerificationCard = (item: Equipment) => {
        const txn = getItemTransaction(item.id);
        const isSelected = selectedItems.has(item.id);
        const activeIssue = getEquipmentIssue(item);
        const hasIssue = activeIssue || isIssueCondition(item.condition);

        return (
            <div
                key={item.id}
                onClick={() => toggleItemSelection(item.id)}
                className={`
                    group bg-white dark:bg-[#1c1c1e] rounded-xl p-5 border transition-all duration-300 cursor-pointer h-full flex flex-col relative
                    ${isSelected
                        ? 'border-primary ring-1 ring-primary shadow-sm'
                        : 'border-gray-200 dark:border-gray-800 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5'
                    }
                `}
            >
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="text-[15px] font-bold text-gray-900 dark:text-white leading-snug truncate group-hover:text-primary transition-colors">
                                {item.name}
                            </h3>
                            {item.metadata?.size && (
                                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-foreground/70 border border-border/60 whitespace-nowrap">{item.metadata.size}</span>
                            )}
                        </div>
                        {itemDetailLine(item) && (
                            <p className="text-[11px] font-medium text-foreground/70 truncate mt-0.5">{itemDetailLine(item)}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                            <span className="max-w-full truncate text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-100 dark:border-gray-700">
                                {txn?.project || 'General'}
                            </span>
                        </div>
                    </div>
                    <span className={`
                        text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 uppercase tracking-wider
                        ${!hasIssue ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900' : 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-100 dark:border-yellow-900'}
                    `}>
                        {!hasIssue ? 'Good' : activeIssue?.severity === 'NOT_USABLE' ? 'Not usable' : activeIssue ? 'Issue' : CONDITION_LABELS[item.condition]}
                    </span>
                </div>

                <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                            {getUserName(item.assignedTo)?.charAt(0)}
                        </div>
                        <span className="truncate">
                            {getUserName(item.assignedTo)}
                        </span>
                    </div>

                    <div className="pt-2 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">{item.barcode}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(item.lastActivity)}</span>
                    </div>

                    {activeIssue && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
                                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                </svg>
                                Returned issue
                            </div>
                            <p className="text-xs font-bold leading-snug">{getIssueSummary(activeIssue)}</p>
                            <p className="line-clamp-2 text-xs font-medium leading-snug">{activeIssue.note}</p>
                        </div>
                    )}
                </div>

                {!isSelected && !selectionMode && (
                    <div className="absolute inset-x-4 bottom-4 pt-2 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 grid grid-cols-3 gap-1.5 translate-y-2 group-hover:translate-y-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleVerify(item.id, 'AVAILABLE');
                            }}
                            className="flex-1 h-8 rounded-lg bg-primary text-white font-medium text-xs hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            Verify
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); openIssueDialog([item.id], 'AVAILABLE_WITH_ISSUE'); }}
                            className="h-8 rounded-lg border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-100"
                        >
                            Issue
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); openIssueDialog([item.id], 'MAINTENANCE'); }}
                            className="h-8 rounded-lg border border-red-100 bg-red-50 px-2 text-xs font-semibold text-red-600 transition-all hover:bg-red-100"
                        >
                            Service
                        </button>
                    </div>
                )}

                {selectionMode && (
                    <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                        <div className={`
                            w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200
                            ${isSelected ? 'bg-primary border-primary' : 'bg-white border-gray-300'}
                        `}>
                            {isSelected && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderManualVerificationCard = (row: PendingManualItem) => (
        <div key={row.key} className="rounded-xl border border-amber-300/60 bg-white p-5 shadow-sm dark:bg-[#1c1c1e]">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="mb-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                        Manual
                    </div>
                    <h3 className="truncate text-[15px] font-bold text-gray-900 dark:text-white">{row.item.name}</h3>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Qty {row.item.returnedQuantity || row.item.quantity} - {row.transaction.project || 'General'}
                    </p>
                </div>
                <span className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold uppercase text-black">
                    Pending
                </span>
            </div>
            {row.item.returnNote && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    {row.item.returnNote}
                </p>
            )}
            <div className="flex gap-2">
                <button
                    onClick={() => handleVerifyManualItem(row, 'RETURNED')}
                    className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-transform active:scale-95"
                >
                    Verify
                </button>
                <button
                    onClick={() => handleVerifyManualItem(row, 'MISSING')}
                    className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white transition-transform active:scale-95"
                >
                    Missing
                </button>
            </div>
        </div>
    );

    // Sort indicator component
    const SortIndicator = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return (
                <svg className="w-3 h-3 opacity-30 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            );
        }
        return sortDirection === 'asc' ? (
            <svg className="w-3 h-3 text-primary ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        ) : (
            <svg className="w-3 h-3 text-primary ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        );
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 select-none mobile-safe-bottom">
            {/* Page Header */}
            <div className="flex flex-col gap-5 pb-4 border-b border-gray-200/50 dark:border-gray-800/50">
                <div className="flex items-end justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Verification</h1>
                        <p className="text-[15px] text-gray-500 dark:text-gray-400 font-medium mt-1">Review recently returned equipment</p>
                    </div>

                    {/* View Toggle */}
                    <div className="hidden sm:flex items-center gap-2 p-1 bg-gray-100/80 dark:bg-gray-800/80 rounded-lg backdrop-blur-sm">
                        <button onClick={() => setViewMode('card')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'card' ? 'bg-white dark:bg-[#1c1c1e] shadow text-primary' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`} title="Grid View">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        </button>
                        <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all duration-200 ${viewMode === 'table' ? 'bg-white dark:bg-[#1c1c1e] shadow text-primary' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`} title="List View">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                        </button>
                    </div>
                </div>

                {/* Main Select All Toggle (Always Visible if items exist) */}
                {(pendingItems.length > 0 || pendingManualItems.length > 0) && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-3 w-3 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                            </span>
                            <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                                {pendingItems.length + pendingManualItems.length} items waiting for action
                            </span>
                        </div>

                        {!selectionMode && pendingItems.length > 0 && (
                            <button
                                onClick={selectAll}
                                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                                Select All
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <div className="flex h-14 w-full items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 shadow-sm transition-all duration-200 focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary dark:border-gray-800 dark:bg-[#1c1c1e]">
                    <Search className="h-5 w-5 shrink-0 text-gray-400" />
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`Search item, QR, serial, ${labels.workLower}, transaction, user...`}
                        className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            aria-label="Clear search"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                    <button
                        type="button"
                        className={`flex h-11 w-12 shrink-0 items-center justify-center rounded-2xl border transition-all active:scale-95 ${showVerificationScanner
                            ? 'border-primary/30 bg-primary text-white shadow-lg shadow-primary/20'
                            : 'border-gray-200 bg-[#1f2937] text-white hover:bg-[#273449] dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800'
                            }`}
                        onClick={() => setShowVerificationScanner(prev => !prev)}
                        title={showVerificationScanner ? 'Hide scanner' : 'Scan item'}
                        aria-label={showVerificationScanner ? 'Hide scanner' : 'Scan item'}
                    >
                        <ScanLine className="h-6 w-6" strokeWidth={2.25} />
                    </button>
                </div>

                {normalizedSearchQuery && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                            {filteredPendingItems.length + filteredPendingManualItems.length} match{filteredPendingItems.length + filteredPendingManualItems.length !== 1 ? 'es' : ''}
                        </span>
                        <span>
                            from {pendingItems.length + pendingManualItems.length} pending items
                        </span>
                    </div>
                )}

                {showVerificationScanner && (
                    <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white p-3 shadow-xl shadow-black/10 dark:border-gray-800 dark:bg-[#1c1c1e]">
                        <div className="mb-3 flex items-center justify-between gap-3 px-1">
                            <div className="min-w-0">
                                <h2 className="text-[18px] font-bold text-gray-900 dark:text-white">QR Code Scanner</h2>
                                <p className="truncate text-[13px] text-gray-500 dark:text-gray-400">Scan a returned item to find it for verification.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowVerificationScanner(false)}
                                className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                            >
                                Close
                            </button>
                        </div>

                        <div className="md:hidden h-[min(72vh,560px)] min-h-[420px] overflow-hidden rounded-[24px] bg-black shadow-[0_16px_40px_-16px_rgba(0,0,0,0.55)]">
                            <MobileScanner
                                onScan={handleVerificationScan}
                                onError={(error) => showToast(error, 'error')}
                                onClose={() => setShowVerificationScanner(false)}
                                autoStart
                            />
                        </div>

                        <div className="hidden md:block">
                            <QRScanner
                                onScan={handleVerificationScan}
                                onError={(error) => showToast(error, 'error')}
                                continuous={false}
                                compact
                                autoStart
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Selection Toolbar - Premium Actions */}
            <div className={`
                fixed bottom-[calc(var(--mobile-tab-height)+0.75rem)] md:bottom-8 left-1/2 transform -translate-x-1/2 z-[110]
                transition-all duration-300 ease-out origin-bottom
                ${selectionMode ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-24 opacity-0 scale-95 pointer-events-none'}
            `}>
                <div className="flex w-[calc(100vw-1.5rem)] max-w-[680px] flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#0F172A] p-2.5 text-white shadow-2xl">
                    <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                        <span className="text-[15px] font-semibold whitespace-nowrap">
                            {selectedItems.size} Item{selectedItems.size !== 1 ? 's' : ''}
                        </span>
                        <button
                            onClick={clearSelection}
                            className="text-sm font-semibold text-gray-300 transition-colors hover:text-white"
                        >
                            Clear
                        </button>
                    </div>

                    {filteredPendingItems.some(item => !selectedItems.has(item.id)) && (
                        <button
                            onClick={selectAll}
                            className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            Select All
                        </button>
                    )}

                    <button
                        onClick={() => handleBulkVerify('AVAILABLE')}
                        className="ml-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-all active:scale-95"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Verify
                    </button>
                    <button
                        onClick={() => openIssueDialog(Array.from(selectedItems), 'AVAILABLE_WITH_ISSUE')}
                        className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-black transition-all active:scale-95"
                    >
                        Issue
                    </button>
                    <button
                        onClick={() => openIssueDialog(Array.from(selectedItems), 'MAINTENANCE')}
                        className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white transition-all active:scale-95"
                    >
                        Maintenance
                    </button>
                </div>
            </div>

            {issueDialog && (
                <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
                    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-[#1c1c1e]">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                                    {issueDialog.mode === 'MAINTENANCE' ? 'Send to Maintenance' : 'Available With Issue'}
                                </h2>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    Add a note so checkout users know exactly what is wrong.
                                </p>
                            </div>
                            <button
                                onClick={() => setIssueDialog(null)}
                                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                aria-label="Close"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <textarea
                            value={issueDialog.note}
                            onChange={(e) => setIssueDialog({ ...issueDialog, note: e.target.value })}
                            className="min-h-[120px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                            placeholder="Example: Camera body works, but audio input is not working."
                            autoFocus
                        />

                        <div className="mt-4 flex gap-2">
                            <button
                                onClick={() => setIssueDialog(null)}
                                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleIssueDialogSubmit}
                                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95 ${issueDialog.mode === 'MAINTENANCE' ? 'bg-red-500' : 'bg-amber-500 text-black'}`}
                            >
                                {issueDialog.mode === 'MAINTENANCE' ? 'Send' : 'Save Issue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isLoading && viewMode === 'table' && visibleSortedItems.length > 0 && filteredPendingManualItems.length > 0 && (
                <section className="space-y-3">
                    <div>
                        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Manual Items</h2>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Items without QR waiting for manager verification</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredPendingManualItems.map(row => (
                            <div key={row.key} className="rounded-xl border border-amber-300/60 bg-white p-4 shadow-sm dark:bg-[#1c1c1e]">
                                <div className="mb-3 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="mb-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                                            Manual
                                        </div>
                                        <h3 className="truncate text-sm font-bold text-gray-900 dark:text-white">{row.item.name}</h3>
                                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                            Qty {row.item.returnedQuantity || row.item.quantity} - {row.transaction.project || 'General'}
                                        </p>
                                    </div>
                                </div>
                                {row.item.returnNote && (
                                    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                        {row.item.returnNote}
                                    </p>
                                )}
                                <div className="flex gap-2">
                                    <button onClick={() => handleVerifyManualItem(row, 'RETURNED')} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">Verify</button>
                                    <button onClick={() => handleVerifyManualItem(row, 'MISSING')} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white">Missing</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Content States */}
            {isLoading ? (
                viewMode === 'table' ? (
                    <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/60 dark:border-gray-800 overflow-hidden shadow-sm">
                        <div className="p-4 space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex gap-4">
                                    <Skeleton className="h-12 w-full rounded-xl" />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-[180px] w-full rounded-xl" />
                        ))}
                    </div>
                )
            ) : pendingItems.length === 0 && pendingManualItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-[#1c1c1e] rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-primary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nothing To Verify</h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                        Nothing is waiting on you. Anything returned with a reported issue shows up
                        here, and depending on your department&apos;s settings clean returns may be
                        cleared automatically or by the next person checking the item out.
                    </p>
                </div>
            ) : normalizedSearchQuery && filteredPendingItems.length === 0 && filteredPendingManualItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-[#1c1c1e] rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No Matching Items</h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                        No pending verification item matches this search or QR code.
                    </p>
                </div>
            ) : viewMode === 'table' && visibleSortedItems.length > 0 ? (
                /* ========== TABLE VIEW ========== */
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-gray-200/60 dark:border-gray-800 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                                    <th className="w-12 px-5 py-3">
                                        <div className="flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={filteredPendingItems.length > 0 && filteredPendingItems.every(item => selectedItems.has(item.id))}
                                                onChange={selectAll}
                                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
                                            />
                                        </div>
                                    </th>
                                    <th className="px-5 py-3 text-left"><button onClick={() => handleSort('item')} className="flex items-center text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Item <SortIndicator field="item" /></button></th>
                                    <th className="px-5 py-3 text-left"><button onClick={() => handleSort('project')} className="flex items-center text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Project <SortIndicator field="project" /></button></th>
                                    <th className="px-5 py-3 text-left"><button onClick={() => handleSort('user')} className="flex items-center text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Returned By <SortIndicator field="user" /></button></th>
                                    <th className="px-5 py-3 text-left"><button onClick={() => handleSort('date')} className="flex items-center text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Date <SortIndicator field="date" /></button></th>
                                    <th className="px-5 py-3 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                {visibleSortedItems.map((item) => {
                                    const txn = getItemTransaction(item.id);
                                    const isSelected = selectedItems.has(item.id);
                                    const activeIssue = getEquipmentIssue(item);

                                    return (
                                        <tr key={item.id} onClick={() => toggleItemSelection(item.id)} className={`group transition-all duration-200 cursor-pointer ${isSelected ? 'bg-primary/5' : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/80'}`}>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-center">
                                                    <input type="checkbox" checked={isSelected} onChange={() => toggleItemSelection(item.id)} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer" />
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 text-gray-400 dark:text-gray-500">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <p className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</p>
                                                            {item.metadata?.size && (
                                                                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-foreground/70 border border-border/60 whitespace-nowrap">{item.metadata.size}</span>
                                                            )}
                                                        </div>
                                                        {itemDetailLine(item) && (
                                                            <p className="text-[11px] font-medium text-foreground/70 truncate mt-0.5">{itemDetailLine(item)}</p>
                                                        )}
                                                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">{item.barcode}</p>
                                                        {activeIssue && (
                                                            <p className="mt-1 max-w-xs truncate rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                                                                {getIssueSummary(activeIssue)}: {activeIssue.note}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-gray-900 dark:text-white">{txn?.project || 'General'}</span>
                                                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{txn ? formatTxnId(txn.id) : ''}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 border border-white dark:border-gray-600 shadow-sm flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300">
                                                        {getUserName(item.assignedTo).charAt(0)}
                                                    </div>
                                                    <span className="text-gray-600 dark:text-gray-400">{getUserName(item.assignedTo)}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-gray-500 dark:text-gray-400">{formatDate(item.lastActivity)}</td>
                                            <td className="px-5 py-4">
                                                {!selectionMode && (
                                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
                                                        <button onClick={() => handleVerify(item.id, 'AVAILABLE')} className="px-4 py-1.5 rounded-full bg-primary/10 hover:bg-primary text-xs font-semibold text-primary hover:text-white transition-all hover:scale-105 active:scale-95">Verify</button>
                                                        <div className="h-4 w-px bg-gray-200 mx-1"></div>
                                                        <button onClick={() => openIssueDialog([item.id], 'AVAILABLE_WITH_ISSUE')} className="px-3 py-1.5 rounded-full bg-amber-50 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">Issue</button>
                                                        <button onClick={() => openIssueDialog([item.id], 'MAINTENANCE')} className="px-3 py-1.5 rounded-full bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors">Service</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* ========== CARD VIEW ========== */
                <div className="space-y-3 pb-[calc(var(--mobile-tab-height)+5rem)] md:pb-0">
                    {filteredPendingManualItems.length > 0 && filteredVerificationGroups.length === 0 && (
                        <section className="space-y-3">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Manual Items</h2>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Items without QR waiting for manager verification</p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredPendingManualItems.map(row => (
                                    <div key={row.key} className="rounded-xl border border-amber-300/60 bg-white p-5 shadow-sm dark:bg-[#1c1c1e]">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="mb-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                                                    Manual
                                                </div>
                                                <h3 className="truncate text-[15px] font-bold text-gray-900 dark:text-white">{row.item.name}</h3>
                                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                    Qty {row.item.returnedQuantity || row.item.quantity} • {row.transaction.project || 'General'}
                                                </p>
                                            </div>
                                            <span className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold uppercase text-black">
                                                Pending
                                            </span>
                                        </div>
                                        {row.item.returnNote && (
                                            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                                {row.item.returnNote}
                                            </p>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleVerifyManualItem(row, 'RETURNED')}
                                                className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-transform active:scale-95"
                                            >
                                                Verify
                                            </button>
                                            <button
                                                onClick={() => handleVerifyManualItem(row, 'MISSING')}
                                                className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white transition-transform active:scale-95"
                                            >
                                                Missing
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {filteredVerificationGroups.map((group) => {
                        const groupSelected = group.items.length > 0 && group.items.every(item => selectedItems.has(item.id));
                        const isExpanded = expandedGroups.has(group.key);
                        const totalItems = group.items.length + group.manualItems.length;

                        return (
                            <section key={group.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1c1c1e]">
                                <button
                                    type="button"
                                    onClick={() => toggleGroupExpanded(group.key)}
                                    className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/40"
                                    aria-expanded={isExpanded}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <svg
                                                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2.5}
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                                            </svg>
                                            <h2 className="truncate text-base font-bold text-gray-900 dark:text-white">
                                                {group.title}
                                            </h2>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-gray-500 dark:text-gray-400">
                                            {group.transactionIds.length > 1 ? (
                                                <span>{group.transactionIds.length} transactions</span>
                                            ) : (
                                                group.txnId && <span className="font-mono">{group.txnId}</span>
                                            )}
                                            <span>{group.date}</span>
                                            <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                                            {group.manualItems.length > 0 && (
                                                <span className="text-amber-600 dark:text-amber-300">
                                                    {group.manualItems.length} manual
                                                </span>
                                            )}
                                        </div>
                                        {!isExpanded && group.notes.length > 0 && (
                                            <div className="mt-2 ml-6 max-w-3xl rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200">
                                                <span className="font-bold">Checkout notes: </span>
                                                <span className="font-medium line-clamp-2">
                                                    {group.notes[0].text}
                                                    {group.notes.length > 1 ? ` (+${group.notes.length - 1} more)` : ''}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                        {isExpanded ? 'Hide items' : 'Show items'}
                                    </span>
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-gray-100 p-4 dark:border-gray-800">
                                        {group.notes.length > 0 && (
                                            <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
                                                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m8-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                                    </svg>
                                                    Checkout Notes
                                                </div>
                                                <div className="space-y-2">
                                                    {group.notes.map(note => (
                                                        <div key={note.transactionId} className="rounded-xl bg-white/70 px-3 py-2 dark:bg-black/20">
                                                            {group.notes.length > 1 && (
                                                                <p className="mb-1 font-mono text-[11px] font-bold text-sky-600 dark:text-sky-300">{note.label}</p>
                                                            )}
                                                            <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">{note.text}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {group.items.length > 0 && (
                                            <div className="mb-3 flex items-center justify-between gap-2">
                                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                    Tap items to verify, or
                                                </span>
                                                <button
                                                    onClick={() => toggleGroupSelection(group.items)}
                                                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 dark:border-gray-800"
                                                >
                                                    {groupSelected ? 'Deselect all' : `Select all (${group.items.length})`}
                                                </button>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                            {group.items.map(renderVerificationCard)}
                                            {group.manualItems.map(renderManualVerificationCard)}
                                        </div>
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
