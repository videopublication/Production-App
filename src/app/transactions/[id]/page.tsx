'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Transaction, Equipment, User, Log, Shoot, Assignment, ManualTransactionItem } from '@/types';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/Badge';
import { QRScanner, MobileScanner } from '@/components/QRScanner';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/dialog-context';
import { useDepartment } from '@/lib/department-context';
import Link from 'next/link';
import { areManualItemsComplete, decodeTransactionNotes } from '@/lib/transaction-manual-items';

const compareByName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

const getShootDateValue = (shoot: Shoot) => {
    if (!shoot.startTime) return 0;
    const time = new Date(shoot.startTime).getTime();
    return Number.isNaN(time) ? 0 : time;
};

const compareShootsByDate = (a: Shoot, b: Shoot) =>
    getShootDateValue(b) - getShootDateValue(a)
    || a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });

const formatShootOption = (shoot: Shoot) => {
    const dateValue = getShootDateValue(shoot);
    const dateLabel = dateValue
        ? new Date(dateValue).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : 'No date';
    const shootNumber = shoot.shootNumber ? `#${shoot.shootNumber} - ` : '';
    return `${shootNumber}${shoot.title} - ${dateLabel}`;
};

const isManualTransactionItem = (value: unknown): value is ManualTransactionItem => {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    return typeof item.id === 'string'
        && typeof item.name === 'string'
        && typeof item.quantity === 'number';
};

const getManualItemsFromUnknown = (value: unknown): ManualTransactionItem[] => {
    if (!value) return [];

    if (typeof value === 'string') {
        return decodeTransactionNotes(value).manualItems;
    }

    if (Array.isArray(value)) {
        return value.filter(isManualTransactionItem);
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (Array.isArray(record.manualItems)) {
            return record.manualItems.filter(isManualTransactionItem);
        }
        if (typeof record.notes === 'string') {
            return decodeTransactionNotes(record.notes).manualItems;
        }
    }

    return [];
};

const recoverManualItemsFromLogs = (logs: Log[]) => {
    const seenIds = new Set<string>();
    const recovered: ManualTransactionItem[] = [];

    for (const log of logs) {
        const candidates = [
            log.details,
            log.oldValue,
            log.newValue,
        ];

        for (const candidate of candidates) {
            const items = getManualItemsFromUnknown(candidate);
            for (const item of items) {
                if (seenIds.has(item.id)) continue;
                seenIds.add(item.id);
                recovered.push(item);
            }
        }

        if (recovered.length > 0) return recovered;
    }

    return recovered;
};

const formatLogDetails = (details?: string) => {
    if (!details) return '';
    const decoded = decodeTransactionNotes(details);
    if (decoded.manualItems.length > 0) {
        return decoded.notes || 'Updated manual item details';
    }
    return details;
};

export default function TransactionDetailPage() {
    const router = useRouter();
    const params = useParams();
    const { user } = useAuth();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const { department } = useDepartment();
    const transactionId = params.id as string;

    // Enforce department isolation
    const effectiveDeptId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);

    const [transaction, setTransaction] = useState<Transaction | null>(null);
    const [equipment, setEquipment] = useState<Equipment[]>([]);
    const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([]);
    const [transactionUser, setTransactionUser] = useState<User | null>(null);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [allShoots, setAllShoots] = useState<Shoot[]>([]);
    const [logs, setLogs] = useState<Log[]>([]);
    const [linkedShoot, setLinkedShoot] = useState<Shoot | null>(null);
    const [shootAssignments, setShootAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Add item states
    const [showAddItem, setShowAddItem] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showQRScanner, setShowQRScanner] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Multi-select states
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [notes, setNotes] = useState('');
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [editProject, setEditProject] = useState('');
    const [editShootId, setEditShootId] = useState('');
    const [editingManualItemId, setEditingManualItemId] = useState<string | null>(null);
    const [manualItemDraft, setManualItemDraft] = useState({
        name: '',
        quantity: '1',
        returnRequired: true,
        notes: '',
    });
    const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);
    const canForceReturnItems = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

    useEffect(() => {
        if (user && !['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(user.role)) {
            router.push('/');
            return;
        }
        loadData();
        setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    }, [user, router, transactionId]);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [txns, equip, users, shoots, assignments] = await Promise.all([
                storage.getTransactions(undefined, undefined, undefined, 'ALL', undefined, undefined, effectiveDeptId),
                storage.getEquipment(effectiveDeptId),
                storage.getUsers(effectiveDeptId),
                storage.getShoots(effectiveDeptId),
                storage.getAssignments(effectiveDeptId)
            ]);

            const loadedTxn = txns.find(t => t.id === transactionId);
            if (!loadedTxn) {
                showToast('Transaction not found', 'error');
                router.push('/transactions');
                return;
            }

            // Fetch logs for this transaction AND its items directly
            // This prevents missing old transaction logs due to the 1000 row limits of global getLogs()
            const entityIdsToFetch = [transactionId, ...loadedTxn.items];
            const allLogs = await storage.getLogsByEntities(entityIdsToFetch);

            let txn = loadedTxn;
            const txnUser = users.find(u => u.id === txn.userId);
            const available = equip.filter(e => e.status === 'AVAILABLE');

            // Find linked shoot and assignments
            let linkedShootData = null;
            let linkedAssignments: Assignment[] = [];

            if (txn.shootId) {
                linkedShootData = shoots.find(s => s.id === txn.shootId) || null;
                linkedAssignments = assignments.filter(a => a.shootId === txn.shootId);
            }

            // Check if department filter needs to be applied manually for SUPER_ADMIN when viewing cross-dept
            // But since logs are directly retrieved by entity IDs tied to this specific transaction,
            // we don't strictly need to filter them out by effectiveDeptId here again.

            // We time-bound the equipment logs to prevent showing the item's 
            // entire historical usage across all projects.
            const txnItemIds = new Set(txn.items);
            const txnStartTime = new Date(txn.timestampOut || 0).getTime() - 60000; // 1 min buffer
            const txnEndTime = txn.timestampIn 
                ? new Date(txn.timestampIn).getTime() + (14 * 24 * 60 * 60 * 1000) // 14 day buffer for verifications
                : Infinity;

            const transactionLogs = allLogs
                .filter(l => {
                    if (l.entityId === transactionId) return true;
                    if (txnItemIds.has(l.entityId)) {
                        const logTime = new Date(l.timestamp).getTime();
                        return logTime >= txnStartTime && logTime <= txnEndTime;
                    }
                    return false;
                })
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            if ((txn.manualItems || []).length === 0) {
                const recoveredManualItems = recoverManualItemsFromLogs(transactionLogs);
                if (recoveredManualItems.length > 0) {
                    await storage.updateTransaction(txn.id, {
                        notes: txn.notes,
                        manualItems: recoveredManualItems,
                    });

                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: txn.id,
                        userId: user?.id,
                        timestamp: new Date().toISOString(),
                        details: `Recovered ${recoveredManualItems.length} manual item${recoveredManualItems.length === 1 ? '' : 's'} from activity history`,
                        newValue: { manualItems: recoveredManualItems },
                        departmentId: effectiveDeptId || txn.departmentId,
                    });

                    txn = {
                        ...txn,
                        manualItems: recoveredManualItems,
                    };
                    showToast('Recovered manual item details from history', 'success');
                }
            }

            setTransaction(txn);
            setLinkedShoot(linkedShootData);
            setShootAssignments(linkedAssignments);
            setNotes(txn.notes || '');
            setEditProject(txn.project || '');
            setEditShootId(txn.shootId || '');
            setEquipment(equip);
            setAvailableEquipment(available);
            setTransactionUser(txnUser || null);
            setAllUsers(users);
            setAllShoots(shoots);
            setLogs(transactionLogs);
        } catch (error) {
            console.error('Error loading data:', error);
            showToast('Error loading transaction data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const getItemDetails = (itemId: string) => {
        return equipment.find(e => e.id === itemId);
    };

    const compareItemIdsByName = (a: string, b: string) => {
        const itemA = getItemDetails(a);
        const itemB = getItemDetails(b);
        if (!itemA && !itemB) return 0;
        if (!itemA) return 1;
        if (!itemB) return -1;
        return compareByName(itemA, itemB);
    };

    const getUserName = (userId?: string) => {
        if (!userId) return 'System / Guest';
        const found = allUsers.find(u => u.id === userId);
        return found ? (found.name || found.email || 'Unknown User') : 'Unknown User';
    };

    const handleAddItem = async (itemId: string) => {
        if (!transaction || transaction.status !== 'OPEN') {
            showToast('Cannot modify closed transactions', 'error');
            return;
        }

        if (transaction.items.includes(itemId)) {
            showToast('Item already in this transaction', 'error');
            return;
        }

        const item = equipment.find(e => e.id === itemId);
        if (!item) {
            alert('Item not found');
            return;
        }

        // If item is not available, check if it's assigned to this transaction (should be caught by includes check above)
        // But if it's assigned to OTHER transaction, block it.
        if (item.status !== 'AVAILABLE') {
            showToast(`Item is not available (Current Status: ${item.status})`, 'error');
            return;
        }

        setSaving(true);
        try {
            // Update transaction
            await storage.updateTransaction(transaction.id, {
                items: [...transaction.items, itemId],
                preCheckoutConditions: {
                    ...transaction.preCheckoutConditions,
                    [itemId]: item.condition,
                },
            });

            // Update item status
            await storage.updateEquipment(itemId, {
                status: 'CHECKED_OUT',
                assignedTo: transaction.userId,
                lastActivity: new Date().toISOString()
            });

            // Log the change
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: transaction.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: `Added item: ${item.name} (${item.barcode}) to transaction "${transaction.project || 'Unspecified'}"`,
            });

            await loadData(true);
            setSearchQuery('');
            setShowAddItem(false);
            setShowQRScanner(false);
            showToast(`Successfully added ${item.name}`, 'success');
        } catch (error) {
            console.error('Error adding item:', error);
            showToast('Error adding item to transaction', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveItem = async (itemId: string) => {
        if (!transaction || transaction.status !== 'OPEN') {
            alert('Cannot modify closed transactions');
            return;
        }

        const item = getItemDetails(itemId);
        if (!item) {
            showToast('Item not found', 'error');
            return;
        }

        const isConfirmed = await confirm({
            title: 'Remove Item?',
            message: `Are you sure you want to remove ${item.name} from this transaction?`,
            confirmLabel: 'Remove',
            variant: 'danger'
        });

        if (!isConfirmed) return;

        setSaving(true);
        try {
            // Update transaction
            const updatedItems = transaction.items.filter(id => id !== itemId);
            const updatedConditions = { ...transaction.preCheckoutConditions };
            delete updatedConditions[itemId];

            await storage.updateTransaction(transaction.id, {
                items: updatedItems,
                preCheckoutConditions: updatedConditions,
            });

            // Update item status back to available
            await storage.updateEquipment(itemId, {
                status: 'AVAILABLE',
                assignedTo: null as unknown as string,
                lastActivity: new Date().toISOString()
            });

            // Log the change
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: transaction.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: `Removed item: ${item.name} (${item.barcode}) from transaction "${transaction.project || 'Unspecified'}"`,
            });

            await loadData(true);
            showToast(`Successfully removed ${item.name}`, 'success');
        } catch (error) {
            console.error('Error removing item:', error);
            showToast('Error removing item from transaction', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleQRScan = async (decodedText: string) => {
        const item = equipment.find(e => e.barcode === decodedText || e.id === decodedText);
        if (item) {
            await handleAddItem(item.id);
        } else {
            showToast('Item not found with this barcode', 'error');
        }
    };



    const handleForceReturn = async (itemId: string) => {
        if (!canForceReturnItems) {
            showToast('Only managers and admins can force return items', 'error');
            return;
        }

        const item = equipment.find(e => e.id === itemId);
        if (!item) {
            showToast('Item not found', 'error');
            return;
        }

        // Allow force return for items that are checked out, pending verification, 
        // or already available (to fix state mismatches within the transaction)
        if (!['CHECKED_OUT', 'PENDING_VERIFICATION', 'AVAILABLE'].includes(item.status)) {
            showToast(`Item cannot be force returned (Status: ${item.status})`, 'error');
            return;
        }

        const isConfirmed = await confirm({
            title: 'Force Return Item?',
            message: `This will mark "${item.name}" as returned and available on behalf of ${transactionUser?.name || 'the user'}.`,
            confirmLabel: 'Force Return',
            variant: 'danger'
        });

        if (!isConfirmed) return;

        setSaving(true);
        try {
            // 1. Update item status directly to AVAILABLE and CLEAR assignee
            await storage.updateEquipment(itemId, {
                status: 'AVAILABLE',
                assignedTo: null as unknown as string,
                lastActivity: new Date().toISOString()
            });

            // 2. Update Transaction (Close if all returned)
            const currentConditions: Record<string, Equipment['condition']> = transaction?.postReturnConditions || {};
            const updatedConditions: Record<string, Equipment['condition']> = {
                ...currentConditions,
                [itemId]: 'OK' // Default to OK for force return, or we could ask
            };

            const allItemsReturned = transaction?.items.every(id =>
                updatedConditions[id] !== undefined
            );

            const txnUpdates: Partial<Transaction> = {
                postReturnConditions: updatedConditions
            };

            if (allItemsReturned) {
                txnUpdates.status = 'CLOSED';
                txnUpdates.timestampIn = new Date().toISOString();
            }

            if (transaction) {
                await storage.updateTransaction(transaction.id, txnUpdates);
            }

            // 3. Log the force return
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'RETURN',
                entityId: transaction!.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: `Force-returned item "${item.name}" (${item.barcode}) on behalf of ${transactionUser?.name || 'user'} - Verified by ${user!.name}${allItemsReturned ? ' (Transaction Closed)' : ''}`,
                departmentId: effectiveDeptId || undefined
            });

            await loadData(true);
            showToast(`${item.name} force-returned. Transaction updated.`, 'success');
        } catch (error) {
            console.error('Error force returning item:', error);
            showToast('Failed to force return item', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Multi-select handlers
    const toggleItemSelection = (itemId: string) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const getCheckedOutItems = () => {
        return transaction?.items.filter(itemId => {
            const item = equipment.find(e => e.id === itemId);
            return item?.status === 'CHECKED_OUT';
        }).sort(compareItemIdsByName) || [];
    };

    const selectAllCheckedOut = () => {
        const checkedOutItems = getCheckedOutItems();
        setSelectedItems(new Set(checkedOutItems));
    };

    const clearSelection = () => {
        setSelectionMode(false);
        setSelectedItems(new Set());
    };

    const handleLongPressStart = (itemId: string) => {
        longPressTimer.current = setTimeout(() => {
            setSelectionMode(true);
            setSelectedItems(new Set([itemId]));
        }, 850); // Increased from 500ms to 850ms to prevent accidental selection while scrolling
    };

    const handleLongPressEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleForceReturnSelected = async () => {
        if (!canForceReturnItems) {
            showToast('Only managers and admins can force return items', 'error');
            return;
        }

        if (selectedItems.size === 0) return;

        const itemNames = Array.from(selectedItems)
            .map(id => equipment.find(e => e.id === id)?.name)
            .filter(Boolean)
            .join(', ');

        const totalTransactionItems = getCheckedOutItems().length;
        const isAllSelected = selectedItems.size === totalTransactionItems;

        const isConfirmed = await confirm({
            title: `Force Return ${selectedItems.size} Item${selectedItems.size !== 1 ? 's' : ''}?`,
            message: `This will mark the following items as returned:\n${itemNames}`,
            confirmLabel: isAllSelected ? 'Return All' : `Return ${selectedItems.size} Item${selectedItems.size !== 1 ? 's' : ''}`,
            variant: 'danger'
        });

        if (!isConfirmed) return;

        setSaving(true);
        try {
            for (const itemId of selectedItems) {
                const item = equipment.find(e => e.id === itemId);
                if (!item || !['CHECKED_OUT', 'PENDING_VERIFICATION', 'AVAILABLE'].includes(item.status)) continue;

                await storage.updateEquipment(itemId, {
                    status: 'PENDING_VERIFICATION',
                    lastActivity: new Date().toISOString()
                });

                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'RETURN',
                    entityId: transaction!.id,
                    userId: user!.id,
                    timestamp: new Date().toISOString(),
                    details: `Force-returned item "${item.name}" (${item.barcode}) on behalf of ${transactionUser?.name || 'user'} - Pending verification`,
                    departmentId: effectiveDeptId || undefined
                });
            }

            await loadData(true);
            showToast(`${selectedItems.size} items force-returned. Awaiting verification.`, 'success');
            clearSelection();
        } catch (error) {
            console.error('Error bulk force returning:', error);
            showToast('Failed to force return items', 'error');
        } finally {
            setSaving(false);
        }
    };

    const filteredAvailableItems = availableEquipment.filter(item => {
        if (!searchQuery) return true;
        const normalize = (str: string) => str.toLowerCase().replace(/[\s\-_]/g, '');
        const normalizedQuery = normalize(searchQuery);
        const basicQuery = searchQuery.toLowerCase().trim();
        return (
            item.name.toLowerCase().includes(basicQuery) ||
            item.category.toLowerCase().includes(basicQuery) ||
            normalize(item.barcode).includes(normalizedQuery) ||
            (item.serialNumber && normalize(item.serialNumber).includes(normalizedQuery)) ||
            normalize(item.name).includes(normalizedQuery)
        );
    }).sort(compareByName);

    if (!user || !['CREW', 'MANAGER', 'ADMIN', 'SUPER_ADMIN', 'FINANCE_MANAGER'].includes(user.role)) {
        return null;
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading transaction...</p>
                </div>
            </div>
        );
    }

    if (!transaction) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Transaction not found</p>
                <Button onClick={() => router.push('/transactions')} className="mt-4">
                    Back to Transactions
                </Button>
            </div>
        );
    }

    const primaryUserName = transactionUser?.name || transactionUser?.email || 'Unknown User';

    // Dynamic Crew List Logic
    let displayUserIds: string[] = [];
    if (linkedShoot) {
        // If linked to a shoot, use the LIVE assignments as the source of truth
        // This ensures if an admin removes a crew member from the shoot, they disappear here.
        const activeCrewIds = shootAssignments
            .filter(a => ['ACCEPTED', 'PENDING'].includes(a.status))
            .map(a => a.userId);

        // Remove primary user from this list to avoid duplication
        displayUserIds = activeCrewIds.filter(id => id !== transaction.userId);
    } else {
        // Fallback to static snapshot for non-shoot transactions
        displayUserIds = transaction.additionalUsers || [];
    }

    const additionalUserNames = displayUserIds
        .map(id => getUserName(id))
        .filter(name => name !== 'Unknown User');

    const manualItemQuantity = (transaction.manualItems || []).reduce((sum, item) => sum + item.quantity, 0);
    const totalItemCount = transaction.items.length + manualItemQuantity;

    const canManualClose = transaction?.status === 'OPEN' && transaction.items.every(itemId => {
        const item = equipment.find(e => e.id === itemId);
        return item && item.status !== 'CHECKED_OUT' && item.status !== 'PENDING_VERIFICATION';
    }) && areManualItemsComplete(transaction.manualItems);

    const canEditTransactionDetails = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);
    const shootOptions = [...allShoots]
        .filter(shoot => shoot.status !== 'CANCELLED')
        .sort(compareShootsByDate);
    const selectedEditShoot = editShootId ? allShoots.find(shoot => shoot.id === editShootId) : null;
    const canEditManualItems = transaction.status === 'OPEN' && canEditTransactionDetails;

    const openDetailsEditor = () => {
        setEditProject(transaction.project || '');
        setEditShootId(transaction.shootId || '');
        setIsEditingDetails(true);
    };

    const openManualItemEditor = (item: ManualTransactionItem) => {
        setEditingManualItemId(item.id);
        setManualItemDraft({
            name: item.name,
            quantity: String(item.quantity),
            returnRequired: item.returnRequired,
            notes: item.notes || '',
        });
    };

    const handleSaveManualItem = async (itemId: string) => {
        if (!transaction || !canEditManualItems) return;

        const currentItem = (transaction.manualItems || []).find(item => item.id === itemId);
        if (!currentItem) return;

        const nextName = manualItemDraft.name.trim();
        const nextQuantity = Number.parseInt(manualItemDraft.quantity, 10);
        if (!nextName) {
            showToast('Manual item name is required', 'error');
            return;
        }
        if (!Number.isFinite(nextQuantity) || nextQuantity < 1) {
            showToast('Quantity must be at least 1', 'error');
            return;
        }

        let updatedItem: ManualTransactionItem = {
            ...currentItem,
            name: nextName,
            quantity: nextQuantity,
            notes: manualItemDraft.notes.trim() || undefined,
            returnRequired: manualItemDraft.returnRequired,
        };

        if (!manualItemDraft.returnRequired) {
            updatedItem = {
                ...updatedItem,
                status: 'RETURNED',
                returnedQuantity: nextQuantity,
                returnCondition: undefined,
                issueType: undefined,
                issueSeverity: undefined,
                returnNote: undefined,
                returnedAt: undefined,
                returnedBy: undefined,
                verifiedAt: undefined,
                verifiedBy: undefined,
            };
        } else if (!currentItem.returnRequired) {
            updatedItem = {
                ...updatedItem,
                status: 'OUT',
                returnedQuantity: undefined,
                returnCondition: undefined,
                returnNote: undefined,
                returnedAt: undefined,
                returnedBy: undefined,
                verifiedAt: undefined,
                verifiedBy: undefined,
            };
        }

        setSaving(true);
        try {
            const updatedManualItems = (transaction.manualItems || []).map(item =>
                item.id === itemId ? updatedItem : item
            );

            await storage.updateTransaction(transaction.id, { manualItems: updatedManualItems });
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: transaction.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details: `Updated manual item "${currentItem.name}" to "${updatedItem.name}" (${updatedItem.returnRequired ? 'return required' : 'consumable'})`,
                oldValue: currentItem,
                newValue: updatedItem,
                departmentId: effectiveDeptId || transaction.departmentId,
            });

            await loadData(true);
            setEditingManualItemId(null);
            showToast('Manual item updated', 'success');
        } catch (error) {
            console.error('Error updating manual item:', error);
            showToast('Failed to update manual item', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveManualItem = async (item: ManualTransactionItem) => {
        if (!transaction || !canEditManualItems) return;

        const isConfirmed = await confirm({
            title: 'Remove Manual Item?',
            message: `Remove "${item.name}" from this transaction?`,
            confirmLabel: 'Remove',
            variant: 'danger'
        });

        if (!isConfirmed) return;

        setSaving(true);
        try {
            const updatedManualItems = (transaction.manualItems || []).filter(manualItem => manualItem.id !== item.id);
            await storage.updateTransaction(transaction.id, { manualItems: updatedManualItems });
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: transaction.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details: `Removed manual item "${item.name}" from transaction`,
                oldValue: item,
                newValue: null,
                departmentId: effectiveDeptId || transaction.departmentId,
            });

            await loadData(true);
            showToast('Manual item removed', 'success');
        } catch (error) {
            console.error('Error removing manual item:', error);
            showToast('Failed to remove manual item', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveTransactionDetails = async () => {
        if (!canEditTransactionDetails || !transaction) return;

        const nextProject = editProject.trim();
        if (!nextProject) {
            showToast('Transaction name is required', 'error');
            return;
        }

        const currentShootId = transaction.shootId || '';
        const nextShootId = editShootId || '';
        const currentProject = transaction.project || '';

        if (nextProject === currentProject && nextShootId === currentShootId) {
            setIsEditingDetails(false);
            return;
        }

        const oldShoot = currentShootId ? allShoots.find(shoot => shoot.id === currentShootId) : null;
        const newShoot = nextShootId ? allShoots.find(shoot => shoot.id === nextShootId) : null;

        setSaving(true);
        try {
            const updates: Partial<Transaction> & { shootId?: string | null } = {};
            if (nextProject !== currentProject) updates.project = nextProject;
            if (nextShootId !== currentShootId) updates.shootId = nextShootId || null;

            await storage.updateTransaction(transaction.id, updates);

            const changes: string[] = [];
            if (nextProject !== currentProject) {
                changes.push(`name from "${currentProject || 'Unspecified'}" to "${nextProject}"`);
            }
            if (nextShootId !== currentShootId) {
                changes.push(`linked shoot from "${oldShoot?.title || 'None'}" to "${newShoot?.title || 'None'}"`);
            }

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: transaction.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details: `Updated transaction details: ${changes.join('; ')}`,
                oldValue: {
                    project: currentProject || null,
                    shootId: currentShootId || null,
                },
                newValue: {
                    project: nextProject,
                    shootId: nextShootId || null,
                },
                departmentId: effectiveDeptId || transaction.departmentId,
            });

            await loadData(true);
            setIsEditingDetails(false);
            showToast('Transaction details updated', 'success');
        } catch (error) {
            console.error('Error updating transaction details:', error);
            showToast('Failed to update transaction details', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveNotes = async () => {
        if (!transaction) return;
        setSaving(true);
        try {
            await storage.updateTransaction(transaction.id, {
                notes: notes.trim()
            });

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: transaction.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: 'Updated transaction notes',
                oldValue: { notes: transaction.notes || '' },
                newValue: { notes: notes.trim() },
                departmentId: effectiveDeptId || transaction.departmentId,
            });

            await loadData(true);
            setIsEditingNotes(false);
            showToast('Notes updated successfully', 'success');
        } catch (error) {
            console.error('Error saving notes:', error);
            showToast('Failed to save notes', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleManualClose = async () => {
        const isConfirmed = await confirm({
            title: 'Close Transaction?',
            message: 'All items appear to be returned. Mark this transaction as CLOSED?',
            confirmLabel: 'Close Transaction',
            variant: 'primary'
        }); // Note: variant default usually blue/primary.

        if (!isConfirmed) return;

        setSaving(true);
        try {
            const currentConditions = transaction!.postReturnConditions || {};
            const updatedConditions = { ...currentConditions };

            transaction!.items.forEach(id => {
                if (!updatedConditions[id]) {
                    const item = equipment.find(e => e.id === id);
                    updatedConditions[id] = item?.condition || 'OK';
                }
            });

            await storage.updateTransaction(transaction!.id, {
                status: 'CLOSED',
                timestampIn: new Date().toISOString(),
                postReturnConditions: updatedConditions
            });

            // IMPORTANT: Also update the equipment items! 
            // Any item that was still checked out or pending should now be available and unassigned.
            await Promise.all(transaction!.items.map(async (itemId) => {
                const item = equipment.find(e => e.id === itemId);
                if (item && (item.status === 'CHECKED_OUT' || item.status === 'PENDING_VERIFICATION')) {
                    await storage.updateEquipment(itemId, {
                        status: 'AVAILABLE',
                        assignedTo: null as unknown as string,
                        lastActivity: new Date().toISOString()
                    });
                }
            }));

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: transaction!.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: `Manually closed transaction - All items confirmed returned.`,
            });

            await loadData(true);
            showToast('Transaction closed successfully', 'success');
        } catch (error) {
            console.error('Error closing transaction:', error);
            showToast('Failed to close transaction', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-12 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight break-words">
                            {transaction.project || 'Unspecified Project'}
                        </h1>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <p className="text-xs sm:text-sm font-medium text-primary">
                                {transaction.id}
                            </p>
                            {linkedShoot ? (
                                <Link href={`/shoots/${linkedShoot.id}`} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md hover:bg-primary/20 transition-colors flex items-center gap-1 font-medium">
                                    <span className="flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                        Linked Shoot: {linkedShoot.title} {linkedShoot.shootNumber ? `(#${linkedShoot.shootNumber})` : ''}
                                    </span>
                                </Link>
                            ) : (
                                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-medium">
                                    No linked shoot
                                </span>
                            )}
                            {canEditTransactionDetails && (
                                <button
                                    type="button"
                                    onClick={openDetailsEditor}
                                    className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md hover:bg-primary/20 transition-colors flex items-center gap-1 font-semibold"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                    </svg>
                                    Edit Details
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-1 sm:mt-0">
                    {canManualClose && (
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleManualClose}
                            isLoading={saving}
                            className="text-xs bg-green-100 text-green-700 hover:bg-green-200 border-green-200"
                        >
                            Mark Closed
                        </Button>
                    )}
                    <Badge variant={transaction.status === 'OPEN' ? 'success' : 'default'} className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                        {transaction.status}
                    </Badge>
                </div>
            </div>

            {isEditingDetails && canEditTransactionDetails && (
                <Card className="p-4 border-primary/30 bg-primary/5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-base font-bold">Edit Transaction Details</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Fix the transaction name or attach it to the correct shoot.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setEditProject(transaction.project || '');
                                setEditShootId(transaction.shootId || '');
                                setIsEditingDetails(false);
                            }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            aria-label="Close edit details"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                        <Input
                            label="Transaction Name"
                            value={editProject}
                            onChange={(event) => setEditProject(event.target.value)}
                            placeholder="Enter transaction name"
                            disabled={saving}
                            className="bg-background"
                        />

                        <div className="w-full">
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Linked Shoot
                            </label>
                            <select
                                value={editShootId}
                                onChange={(event) => setEditShootId(event.target.value)}
                                disabled={saving}
                                className="flex h-12 w-full rounded-2xl border border-input bg-background px-4 py-2 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="">No linked shoot</option>
                                {shootOptions.map((shoot) => (
                                    <option key={shoot.id} value={shoot.id}>
                                        {formatShootOption(shoot)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {selectedEditShoot && (
                        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl bg-background/80 border border-border px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected shoot</p>
                                <p className="text-sm font-medium truncate">
                                    {formatShootOption(selectedEditShoot)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditProject(selectedEditShoot.title)}
                                className="text-xs font-semibold text-primary hover:text-primary/80 self-start sm:self-auto"
                            >
                                Use shoot name
                            </button>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 mt-4">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                setEditProject(transaction.project || '');
                                setEditShootId(transaction.shootId || '');
                                setIsEditingDetails(false);
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSaveTransactionDetails}
                            isLoading={saving}
                        >
                            Save Details
                        </Button>
                    </div>
                </Card>
            )}

            {/* Transaction Info Cards - Desktop: Grid, Mobile: Compact Single Card */}
            {/* Desktop View */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground mb-1">Checked Out By</p>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                                {primaryUserName} (Primary)
                            </span>
                        </div>
                        {additionalUserNames.map((name, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                    {name} {linkedShoot ? '(Crew)' : ''}
                                </span>
                            </div>
                        ))}
                        {additionalUserNames.length === 0 && linkedShoot && (
                            <span className="text-xs text-muted-foreground italic">No other crew assigned</span>
                        )}
                    </div>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground mb-1">Checkout Time</p>
                    <p className="font-semibold">{new Date(transaction.timestampOut).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {new Date(transaction.timestampOut).toLocaleTimeString()}
                    </p>
                </Card>
                <Card className="p-4">
                    <p className="text-sm text-muted-foreground mb-1">Total Items</p>
                    <p className="font-semibold text-2xl">{totalItemCount}</p>
                </Card>
            </div>

            {/* Mobile View - Compact Single Card */}
            <div className="sm:hidden bg-white dark:bg-card rounded-2xl border border-border p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Checked Out By</p>
                        <p className="font-semibold text-sm truncate">{primaryUserName}</p>
                        {additionalUserNames.length > 0 && (
                            <p className="text-xs text-muted-foreground truncate">
                                +{additionalUserNames.length} more: {additionalUserNames.join(', ')}
                            </p>
                        )}
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Items</p>
                        <p className="font-bold text-2xl text-primary leading-none">{totalItemCount}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                    <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{new Date(transaction.timestampOut).toLocaleDateString()}</span>
                        <span className="mx-1.5">•</span>
                        <span>{new Date(transaction.timestampOut).toLocaleTimeString()}</span>
                    </p>
                </div>
            </div>

            {/* Items List */}
            <Card>
                {/* Selection Mode Toolbar */}
                {selectionMode ? (
                    <div className="flex items-center justify-between gap-2 mb-4 px-4 py-2.5 bg-gray-100 dark:bg-gray-800/80 backdrop-blur rounded-2xl border border-border">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={clearSelection}
                                className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={selectAllCheckedOut}
                                className="px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors whitespace-nowrap"
                            >
                                All ({getCheckedOutItems().length})
                            </button>
                            <button
                                onClick={handleForceReturnSelected}
                                disabled={selectedItems.size === 0 || saving}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 disabled:opacity-50 text-white transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                                </svg>
                                Return
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <h2 className="text-lg font-semibold">Checked Out Items</h2>
                        <div className="flex items-center gap-2">
                            {transaction.status === 'OPEN' && getCheckedOutItems().length > 1 && canForceReturnItems && (
                                <button
                                    onClick={() => {
                                        setSelectionMode(true);
                                        selectAllCheckedOut();
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                >
                                    Select
                                </button>
                            )}
                            {transaction.status === 'OPEN' && (
                                <Button
                                    size="sm"
                                    onClick={() => setShowAddItem(!showAddItem)}
                                    disabled={saving}
                                >
                                    <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* Add Item Section - Premium UI */}
                {showAddItem && transaction.status === 'OPEN' && (
                    <div className="mb-8 animate-in slide-in-from-top-4 fade-in duration-300">
                        <div className="bg-card rounded-3xl border border-border shadow-xl overflow-hidden">
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                                <div>
                                    <h3 className="font-bold text-[17px]">Add Equipment</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">Search or scan to add items to this active transaction</p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowAddItem(false)}
                                    className="hover:bg-muted rounded-full w-8 h-8 p-0"
                                >
                                    <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </Button>
                            </div>

                            <div className="p-5 space-y-5">
                                {/* Search & Scan Controls */}
                                <div className="flex gap-3">
                                    <div className="relative flex-1 group">
                                        <svg className="w-5 h-5 text-gray-400 absolute left-3.5 top-3.5 transition-colors group-focus-within:text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            placeholder="Search by name, barcode, or category..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full h-12 pl-11 pr-4 bg-muted border border-transparent focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/10 rounded-2xl text-[15px] transition-all outline-none"
                                            autoFocus
                                        />
                                    </div>
                                    <Button
                                        onClick={() => setShowQRScanner(!showQRScanner)}
                                        className={`h-12 px-5 rounded-2xl border-0 shadow-lg shadow-primary/ active:scale-95 transition-all ${showQRScanner ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-[var(--primary)] hover:brightness-110 text-white'}`}
                                    >
                                        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            {showQRScanner ? (
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            ) : (
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                            )}
                                        </svg>
                                        {showQRScanner ? 'Close' : 'Scan'}
                                    </Button>
                                </div>

                                {showQRScanner && (
                                    <div className="h-[320px] rounded-2xl overflow-hidden border border-border shadow-inner bg-black">
                                        {isMobile ? (
                                            <MobileScanner onScan={handleQRScan} onClose={() => setShowQRScanner(false)} />
                                        ) : (
                                            <QRScanner onScan={handleQRScan} />
                                        )}
                                    </div>
                                )}

                                {/* Results List */}
                                <div className="max-h-[320px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                                    {filteredAvailableItems.length === 0 ? (
                                        <div className="text-center py-10 text-muted-foreground">
                                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                </svg>
                                            </div>
                                            <p className="text-sm font-medium">No available items found</p>
                                            <p className="text-xs mt-1">Try a different search term</p>
                                        </div>
                                    ) : (
                                        filteredAvailableItems.map(item => (
                                            <div
                                                key={item.id}
                                                className="group flex items-center justify-between p-3 pl-3 pr-4 bg-card rounded-2xl border border-border hover:border-primary hover:shadow-md transition-all duration-200"
                                            >
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="font-bold text-[15px] truncate group-hover:text-primary transition-colors">{item.name}</h4>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{item.barcode}</span>
                                                            <span className="text-xs text-muted-foreground truncate">• {item.category}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleAddItem(item.id)}
                                                    isLoading={saving}
                                                    className="rounded-xl px-5 h-9 bg-primary text-primary-foreground hover:bg-primary/90 border-0 transition-colors font-medium"
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Current Items - Compact List */}
                <div className="space-y-2">
                    {transaction.items.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>{manualItemQuantity > 0 ? 'No inventory items in this transaction' : 'No items in this transaction'}</p>
                        </div>
                    ) : (
                        [...transaction.items].sort(compareItemIdsByName).map((itemId, index) => {
                            const item = getItemDetails(itemId);
                            if (!item) return null;

                            const isTxnClosed = transaction.status === 'CLOSED';
                            const hasReturnRecord = transaction.postReturnConditions?.[itemId] !== undefined;

                            // Status determination is strictly transaction-context-aware
                            const isReturned = isTxnClosed || hasReturnRecord;
                            const isCheckedOut = !isReturned;

                            const isSelected = selectedItems.has(itemId);
                            const canSelect = isCheckedOut && transaction.status === 'OPEN' && canForceReturnItems;

                            return (
                                <div
                                    key={itemId}
                                    className={`p-3 bg-card rounded-xl border-2 transition-all cursor-pointer ${isSelected
                                        ? 'border-primary bg-primary/5 shadow-sm'
                                        : 'border-transparent hover:border-border hover:shadow-sm'
                                        }`}
                                    onTouchStart={() => canSelect && handleLongPressStart(itemId)}
                                    onTouchEnd={handleLongPressEnd}
                                    onTouchMove={handleLongPressEnd}
                                    onMouseDown={() => canSelect && handleLongPressStart(itemId)}
                                    onMouseUp={handleLongPressEnd}
                                    onMouseLeave={handleLongPressEnd}
                                    onClick={() => {
                                        if (selectionMode && canSelect) {
                                            toggleItemSelection(itemId);
                                        }
                                    }}
                                >
                                    {/* Top Row - Checkbox/Number + Item Info */}
                                    <div className="flex items-start gap-3">
                                        {/* Checkbox (selection mode) or Number Badge */}
                                        {selectionMode && canSelect ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleItemSelection(itemId);
                                                }}
                                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${isSelected
                                                    ? 'bg-primary text-white'
                                                    : 'bg-muted border-2 border-muted-foreground/30'
                                                    }`}
                                            >
                                                {isSelected && (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </button>
                                        ) : (
                                            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                                                {index + 1}
                                            </div>
                                        )}

                                        {/* Item Info - Full width */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-sm text-foreground leading-tight">{item.name}</h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {item.category} • {item.barcode}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Bottom Row - Status + Actions (hide in selection mode) */}
                                    {!selectionMode && (
                                        <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border/50">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${isCheckedOut
                                                ? 'bg-orange-500 text-white'
                                                : 'bg-green-500 text-white'
                                                }`}>
                                                {isCheckedOut ? 'Checked Out' : 'Returned'}
                                            </span>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2">
                                                {/* Force Return button - only for checked out items */}
                                                {transaction.status === 'OPEN' && isCheckedOut && canForceReturnItems && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleForceReturn(itemId);
                                                        }}
                                                        disabled={saving}
                                                        title="Force return this item"
                                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-colors flex items-center gap-1.5"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                                                        </svg>
                                                        Return
                                                    </button>
                                                )}

                                                {/* Remove button - only for open transactions */}
                                                {transaction.status === 'OPEN' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRemoveItem(itemId);
                                                        }}
                                                        disabled={saving}
                                                        title="Remove from transaction"
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {(transaction.manualItems || []).length > 0 && (
                    <div className="space-y-2 pt-3">
                        <h3 className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Manual Items</h3>
                        {(transaction.manualItems || []).map((item, index) => {
                            const isEditingManualItem = editingManualItemId === item.id;
                            const statusLabel = item.returnRequired
                                ? item.status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
                                : 'Consumable';
                            const statusClass = item.status === 'OUT'
                                ? 'bg-orange-500 text-white'
                                : item.status === 'PENDING_VERIFICATION'
                                    ? 'bg-amber-500 text-black'
                                    : item.status === 'MISSING'
                                        ? 'bg-red-500 text-white'
                                        : 'bg-green-500 text-white';

                            return (
                                <div key={item.id} className="rounded-xl border border-amber-300/50 bg-card p-3">
                                    <div className="flex items-start gap-3">
                                        <div className="w-7 h-7 rounded-lg bg-amber-500 text-black flex items-center justify-center text-xs font-bold shrink-0">
                                            {transaction.items.length + index + 1}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            {isEditingManualItem ? (
                                                <div className="space-y-3">
                                                    <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
                                                        <input
                                                            type="text"
                                                            value={manualItemDraft.name}
                                                            onChange={(event) => setManualItemDraft(prev => ({ ...prev, name: event.target.value }))}
                                                            className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                            placeholder="Manual item name"
                                                            disabled={saving}
                                                        />
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={manualItemDraft.quantity}
                                                            onChange={(event) => setManualItemDraft(prev => ({ ...prev, quantity: event.target.value }))}
                                                            className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                            placeholder="Qty"
                                                            disabled={saving}
                                                        />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={manualItemDraft.notes}
                                                        onChange={(event) => setManualItemDraft(prev => ({ ...prev, notes: event.target.value }))}
                                                        className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                                        placeholder="Optional note"
                                                        disabled={saving}
                                                    />
                                                    <div>
                                                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Item Type</p>
                                                        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-background p-1 border border-border">
                                                            <button
                                                                type="button"
                                                                onClick={() => setManualItemDraft(prev => ({ ...prev, returnRequired: true }))}
                                                                disabled={saving}
                                                                className={`h-11 rounded-xl text-sm font-bold transition-colors ${manualItemDraft.returnRequired
                                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                                    : 'text-muted-foreground hover:text-foreground'
                                                                    }`}
                                                            >
                                                                Return required
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setManualItemDraft(prev => ({ ...prev, returnRequired: false }))}
                                                                disabled={saving}
                                                                className={`h-11 rounded-xl text-sm font-bold transition-colors ${!manualItemDraft.returnRequired
                                                                    ? 'bg-orange-500 text-white shadow-sm'
                                                                    : 'text-muted-foreground hover:text-foreground'
                                                                    }`}
                                                            >
                                                                Consumable
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="font-semibold text-sm text-foreground leading-tight">{item.name}</h3>
                                                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                                                            Manual
                                                        </span>
                                                    </div>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        Qty {item.quantity}
                                                    </p>
                                                    {item.notes && (
                                                        <p className="mt-2 rounded-lg bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
                                                            <span className="font-semibold text-foreground">Note:</span> {item.notes}
                                                        </p>
                                                    )}
                                                    {item.returnNote && (
                                                        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                                            {item.returnNote}
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusClass}`}>
                                            {statusLabel}
                                        </span>
                                        {canEditManualItems && (
                                            <div className="flex items-center gap-2">
                                                {isEditingManualItem ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingManualItemId(null);
                                                                setManualItemDraft({ name: '', quantity: '1', returnRequired: true, notes: '' });
                                                            }}
                                                            disabled={saving}
                                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSaveManualItem(item.id)}
                                                            disabled={saving}
                                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                                        >
                                                            Save
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => openManualItemEditor(item)}
                                                            disabled={saving}
                                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveManualItem(item)}
                                                            disabled={saving}
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                            title="Remove manual item"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>



            {/* Notes Section - Editable */}
            <Card>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes / Other Items</h3>
                    {transaction.status === 'OPEN' && !isEditingNotes && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsEditingNotes(true)}
                            className="h-7 text-xs hover:bg-muted"
                        >
                            Edit
                        </Button>
                    )}
                </div>

                {isEditingNotes ? (
                    <div className="space-y-3">
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full min-h-[100px] p-3 rounded-xl bg-muted border-transparent focus:bg-background focus:border-primary transition-all resize-y text-sm"
                            placeholder="Add notes about this transaction..."
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    setNotes(transaction.notes || '');
                                    setIsEditingNotes(false);
                                }}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSaveNotes}
                                isLoading={saving}
                            >
                                Save Notes
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
                        {transaction.notes ? (
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{transaction.notes}</p>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">No notes added</p>
                        )}
                    </div>
                )}
            </Card>

            {/* Activity History Log - Compact */}
            <Card>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Activity History</h3>
                    <span className="text-xs text-muted-foreground">{logs.length} entries</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {logs.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3 italic">No activity recorded</p>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                                <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0 mt-0.5">
                                    {getUserName(log.userId).charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground italic leading-relaxed">
                                        <span className="font-medium not-italic text-foreground">{getUserName(log.userId)}</span>
                                        {' — '}
                                        {formatLogDetails(log.details) || log.action}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                        {new Date(log.timestamp).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            {
                transaction.status === 'CLOSED' && (
                    <Card className="p-4 bg-gray-50 dark:bg-gray-900/50 border-gray-300 dark:border-gray-700">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">Transaction Closed</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    This transaction has been closed and cannot be modified. All items have been returned.
                                </p>
                            </div>
                        </div>
                    </Card>
                )
            }
        </div >
    );
}
