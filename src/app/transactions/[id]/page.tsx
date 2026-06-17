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
import { getDepartmentLabels } from '@/lib/department-labels';

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

const ACTION_LABELS: Record<string, string> = {
    CHECKOUT: 'Checked out items',
    RETURN: 'Returned items',
    VERIFY: 'Verified return',
    EDIT: 'Edited transaction',
    CREATE: 'Created transaction',
    LOGIN: 'Logged in',
    LOGOUT: 'Logged out',
    SIGNUP: 'Signed up',
    LOGIN_FAILED: 'Login failed',
};

const formatLogAction = (action?: string) => {
    if (!action) return 'Activity recorded';
    return ACTION_LABELS[action] ?? action.charAt(0) + action.slice(1).toLowerCase().replace(/_/g, ' ');
};

const formatLogTimestamp = (ts: string) =>
    new Date(ts).toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    });

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
    const labels = getDepartmentLabels(department);
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
    const [activitySearch, setActivitySearch] = useState('');
    const [activityActionFilter, setActivityActionFilter] = useState<string>('ALL');
    const [activityVisibleCount, setActivityVisibleCount] = useState(50);
    const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
    const [linkedShoot, setLinkedShoot] = useState<Shoot | null>(null);
    const [shootAssignments, setShootAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // Guards manualItems-from-logs recovery against duplicate writes if the user reloads
    // mid-flight (between updateTransaction and addLog).
    const manualItemsRecoveryAttempted = React.useRef<Set<string>>(new Set());

    // Add item states
    const [showAddItem, setShowAddItem] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showQRScanner, setShowQRScanner] = useState(false);
    const [itemsToAdd, setItemsToAdd] = useState<Set<string>>(new Set());
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

            // Fetch logs server-side bounded by time to cut bandwidth.
            // Transaction-level logs: no time bound (always relevant to this txn).
            // Item-level logs: bounded to [txn.timestampOut - 1min, txn.timestampIn + 14d OR txn.timestampOut + 30d if still open]
            // The 14d / 30d outer caps are deliberately generous — final per-item trimming
            // happens client-side using each item's "next checkout" boundary below.
            const outerStartISO = new Date(
                new Date(loadedTxn.timestampOut || 0).getTime() - 60000
            ).toISOString();
            const outerEndMs = loadedTxn.timestampIn
                ? new Date(loadedTxn.timestampIn).getTime() + 14 * 24 * 60 * 60 * 1000
                : new Date(loadedTxn.timestampOut || Date.now()).getTime() + 30 * 24 * 60 * 60 * 1000;
            const outerEndISO = new Date(outerEndMs).toISOString();

            const [txnScopedLogs, itemScopedLogs] = await Promise.all([
                storage.getLogsByEntities([transactionId]),
                loadedTxn.items.length > 0
                    ? storage.getLogsByEntities(loadedTxn.items, { since: outerStartISO, until: outerEndISO })
                    : Promise.resolve([] as Log[]),
            ]);
            const allLogs = [...txnScopedLogs, ...itemScopedLogs];

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

            // Per-item time bounds. Equipment is reused across transactions, so each item
            // gets its own [start, end] window:
            //   start = txn.timestampOut - 1 min (clock skew buffer)
            //   end   = min(txn.timestampIn + 3 days for verifications, next CHECKOUT of this item)
            // Capping at the next CHECKOUT of the same item prevents another transaction's
            // logs from leaking in if the item was reused soon after return.
            const txnItemIds = new Set(txn.items);
            const txnStartTime = new Date(txn.timestampOut || 0).getTime() - 60000;
            const txnReturnedAtPlusVerifyTail = txn.timestampIn
                ? new Date(txn.timestampIn).getTime() + (3 * 24 * 60 * 60 * 1000)
                : Infinity;

            // Build per-item "next checkout after this txn" boundary so logs from a later
            // checkout of the same equipment are excluded. CHECKOUT logs are keyed by
            // transaction ID (not item ID), so we derive the cap from the timestampOut
            // of any OTHER transaction whose items include this equipment.
            const thisTxnOutMs = new Date(txn.timestampOut || 0).getTime();
            const itemNextCheckoutAfter = new Map<string, number>();
            for (const otherTxn of txns) {
                if (otherTxn.id === txn.id) continue;
                const otherOutMs = new Date(otherTxn.timestampOut || 0).getTime();
                if (!Number.isFinite(otherOutMs) || otherOutMs <= thisTxnOutMs) continue;
                for (const itemId of otherTxn.items || []) {
                    if (!txnItemIds.has(itemId)) continue;
                    const existing = itemNextCheckoutAfter.get(itemId) ?? Infinity;
                    if (otherOutMs < existing) itemNextCheckoutAfter.set(itemId, otherOutMs);
                }
            }

            const transactionLogs = allLogs
                .filter(l => {
                    if (l.entityId === transactionId) return true;
                    if (!txnItemIds.has(l.entityId)) return false;
                    const logTime = new Date(l.timestamp).getTime();
                    if (logTime < txnStartTime) return false;
                    const nextCheckout = itemNextCheckoutAfter.get(l.entityId) ?? Infinity;
                    const effectiveEnd = Math.min(txnReturnedAtPlusVerifyTail, nextCheckout);
                    return logTime <= effectiveEnd;
                })
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            if (
                (txn.manualItems || []).length === 0 &&
                !manualItemsRecoveryAttempted.current.has(txn.id)
            ) {
                manualItemsRecoveryAttempted.current.add(txn.id);
                const recoveredManualItems = recoverManualItemsFromLogs(transactionLogs);
                if (recoveredManualItems.length > 0) {
                    await storage.updateTransaction(txn.id, {
                        notes: txn.notes,
                        manualItems: recoveredManualItems,
                    });

                    // Deterministic log ID: PK insert collision will silently no-op on a
                    // duplicate cross-session run, so we get at-most-one recovery log per txn.
                    await storage.addLog({
                        id: `recovery-manual-items-${txn.id}`,
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

    // Returns the list of item display labels behind a CHECKOUT log.
    // Prefers structured `new_value.itemNames` written by newer code. For legacy
    // logs without that, falls back to: txn.items at checkout time (excluding items
    // added later via subsequent "Added item:" EDIT logs that come AFTER this log).
    const getCheckoutLogItems = (log: Log): string[] => {
        const nv = log.newValue as { itemNames?: string[]; itemIds?: string[] } | undefined;
        if (nv?.itemNames && nv.itemNames.length > 0) return nv.itemNames;
        if (!transaction) return [];
        const checkoutMs = new Date(log.timestamp).getTime();
        const idsAddedAfter = new Set<string>();
        for (const other of logs) {
            if (other.action !== 'EDIT') continue;
            if (new Date(other.timestamp).getTime() <= checkoutMs) continue;
            const ov = other.newValue as { addedItemIds?: string[] } | undefined;
            ov?.addedItemIds?.forEach(id => idsAddedAfter.add(id));
        }
        const initialIds = transaction.items.filter(id => !idsAddedAfter.has(id));
        return initialIds.map(id => {
            const eq = equipment.find(e => e.id === id);
            return eq ? `${eq.name}${eq.barcode ? ` (${eq.barcode})` : ''}` : id;
        });
    };

    // Returns avatar initial. Falls back to "?" for deleted/unknown users so the
    // avatar visibly signals "user no longer exists" instead of showing a stray "U".
    const getUserAvatarChar = (userId?: string) => {
        if (!userId) return '·';
        const found = allUsers.find(u => u.id === userId);
        if (!found) return '?';
        const source = found.name || found.email || '';
        return source.charAt(0).toUpperCase() || '?';
    };

    const getAddableItem = (itemId: string) => {
        if (!transaction) return null;
        const item = equipment.find(e => e.id === itemId);
        if (!item) return null;
        if (transaction.items.includes(itemId)) return null;
        if (item.status !== 'AVAILABLE') return null;
        return item;
    };

    const toggleItemToAdd = (itemId: string) => {
        const item = equipment.find(e => e.id === itemId);
        if (!item) {
            showToast('Item not found', 'error');
            return;
        }

        if (transaction?.items.includes(itemId)) {
            showToast('Item already in this transaction', 'error');
            return;
        }

        if (item.status !== 'AVAILABLE') {
            showToast(`Item is not available (Current Status: ${item.status})`, 'error');
            return;
        }

        setItemsToAdd(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const handleAddItems = async (itemIds: string[]) => {
        if (!transaction || transaction.status !== 'OPEN') {
            showToast('Cannot modify closed transactions', 'error');
            return;
        }

        const uniqueIds = Array.from(new Set(itemIds));
        const validItems = uniqueIds
            .map(getAddableItem)
            .filter((item): item is Equipment => Boolean(item));

        if (validItems.length === 0) {
            showToast('Select at least one available item to add', 'error');
            return;
        }

        if (validItems.length !== uniqueIds.length) {
            showToast('Some selected items are no longer available and were skipped', 'error');
        }

        const itemIdsToAdd = validItems.map(item => item.id);
        const itemSummaries = validItems.map(item => `${item.name} (${item.barcode})`);
        const logSummary = itemSummaries.length <= 6
            ? itemSummaries.join(', ')
            : `${itemSummaries.slice(0, 6).join(', ')} and ${itemSummaries.length - 6} more`;

        if (validItems.length === 0) {
            return;
        }

        setSaving(true);
        try {
            await storage.updateTransaction(transaction.id, {
                items: [...transaction.items, ...itemIdsToAdd],
                preCheckoutConditions: {
                    ...transaction.preCheckoutConditions,
                    ...Object.fromEntries(validItems.map(item => [item.id, item.condition])),
                },
            });

            const updatedAt = new Date().toISOString();
            await Promise.all(validItems.map(item =>
                storage.updateEquipment(item.id, {
                    status: 'CHECKED_OUT',
                    assignedTo: transaction.userId,
                    lastActivity: updatedAt
                })
            ));

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: transaction.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: validItems.length === 1
                    ? `Added item: ${itemSummaries[0]} to transaction "${transaction.project || 'Unspecified'}"`
                    : `Added ${validItems.length} items: ${logSummary} to transaction "${transaction.project || 'Unspecified'}"`,
                newValue: {
                    addedItemIds: itemIdsToAdd,
                    addedItemNames: itemSummaries,
                },
                departmentId: effectiveDeptId || transaction.departmentId,
            });

            await loadData(true);
            setSearchQuery('');
            setItemsToAdd(new Set());
            setShowAddItem(false);
            setShowQRScanner(false);
            showToast(
                validItems.length === 1
                    ? `Successfully added ${validItems[0].name}`
                    : `Successfully added ${validItems.length} items`,
                'success'
            );
        } catch (error) {
            console.error('Error adding items:', error);
            showToast('Error adding items to transaction', 'error');
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
            if (itemsToAdd.has(item.id)) {
                showToast(`${item.name} is already selected`, 'success');
                return;
            }

            const addableItem = getAddableItem(item.id);
            if (!addableItem) {
                showToast(
                    transaction?.items.includes(item.id)
                        ? 'Item already in this transaction'
                        : `Item is not available (Current Status: ${item.status})`,
                    'error'
                );
                return;
            }

            setItemsToAdd(prev => {
                const next = new Set(prev);
                next.add(item.id);
                return next;
            });
            showToast(`Selected ${item.name}`, 'success');
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
    const selectedAddItems = Array.from(itemsToAdd)
        .map(getAddableItem)
        .filter((item): item is Equipment => Boolean(item));

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
                changes.push(`linked ${labels.workLower} from "${oldShoot?.title || 'None'}" to "${newShoot?.title || 'None'}"`);
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
                                        Linked {labels.workSingular}: {linkedShoot.title} {linkedShoot.shootNumber ? `(#${linkedShoot.shootNumber})` : ''}
                                    </span>
                                </Link>
                            ) : (
                                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-medium">
                                    No linked {labels.workLower}
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
                                Fix the transaction name or attach it to the correct {labels.workLower}.
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
                                Linked {labels.workSingular}
                            </label>
                            <select
                                value={editShootId}
                                onChange={(event) => setEditShootId(event.target.value)}
                                disabled={saving}
                                className="flex h-12 w-full rounded-2xl border border-input bg-background px-4 py-2 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="">No linked {labels.workLower}</option>
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
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected {labels.workLower}</p>
                                <p className="text-sm font-medium truncate">
                                    {formatShootOption(selectedEditShoot)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditProject(selectedEditShoot.title)}
                                className="text-xs font-semibold text-primary hover:text-primary/80 self-start sm:self-auto"
                            >
                                Use {labels.workLower} name
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
                                    {name} {linkedShoot ? `(${labels.teamPlural})` : ''}
                                </span>
                            </div>
                        ))}
                        {additionalUserNames.length === 0 && linkedShoot && (
                            <span className="text-xs text-muted-foreground italic">No other {labels.teamPluralLower} assigned</span>
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
                                    onClick={() => {
                                        const shouldShow = !showAddItem;
                                        setShowAddItem(shouldShow);
                                        if (!shouldShow) {
                                            setItemsToAdd(new Set());
                                            setShowQRScanner(false);
                                        }
                                    }}
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
                                    <p className="text-xs text-muted-foreground mt-0.5">Search or scan, select multiple items, then add them together</p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setShowAddItem(false);
                                        setItemsToAdd(new Set());
                                        setShowQRScanner(false);
                                    }}
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

                                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground">
                                            {selectedAddItems.length} item{selectedAddItems.length !== 1 ? 's' : ''} selected
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {selectedAddItems.length > 0
                                                ? selectedAddItems.slice(0, 4).map(item => item.name).join(', ') + (selectedAddItems.length > 4 ? ` and ${selectedAddItems.length - 4} more` : '')
                                                : 'Select available items from the list below'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setItemsToAdd(new Set())}
                                            disabled={selectedAddItems.length === 0 || saving}
                                        >
                                            Clear
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => handleAddItems(Array.from(itemsToAdd))}
                                            disabled={selectedAddItems.length === 0 || saving}
                                            isLoading={saving}
                                        >
                                            Add Selected
                                        </Button>
                                    </div>
                                </div>

                                {showQRScanner && (
                                    <div className="h-[min(72vh,560px)] min-h-[420px] md:h-[360px] md:min-h-0 rounded-2xl overflow-hidden border border-border shadow-inner bg-black">
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
                                        filteredAvailableItems.map(item => {
                                            const isQueued = itemsToAdd.has(item.id);

                                            return (
                                            <div
                                                key={item.id}
                                                onClick={() => toggleItemToAdd(item.id)}
                                                className={`group flex cursor-pointer items-center justify-between p-3 pl-3 pr-4 rounded-2xl border transition-all duration-200 ${isQueued
                                                    ? 'bg-primary/5 border-primary shadow-md'
                                                    : 'bg-card border-border hover:border-primary hover:shadow-md'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isQueued
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'bg-muted text-muted-foreground group-hover:text-primary'
                                                        }`}>
                                                        {isQueued ? (
                                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                            </svg>
                                                        )}
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
                                                    variant={isQueued ? 'secondary' : 'outline'}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        toggleItemToAdd(item.id);
                                                    }}
                                                    isLoading={saving}
                                                    className="rounded-xl px-5 h-9 transition-colors font-medium"
                                                >
                                                    {isQueued ? 'Selected' : 'Select'}
                                                </Button>
                                            </div>
                                            );
                                        })
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

            {/* Activity History Log */}
            {(() => {
                const distinctActions = Array.from(new Set(logs.map(l => l.action))).sort();
                const normalizedSearch = activitySearch.trim().toLowerCase();
                const filteredLogs = logs.filter(l => {
                    if (activityActionFilter !== 'ALL' && l.action !== activityActionFilter) return false;
                    if (!normalizedSearch) return true;
                    const haystack = [
                        getUserName(l.userId),
                        l.details ?? '',
                        l.action ?? '',
                        formatLogAction(l.action),
                    ].join(' ').toLowerCase();
                    return haystack.includes(normalizedSearch);
                });
                const visibleLogs = filteredLogs.slice(0, activityVisibleCount);
                // Group by local date for date headers.
                const groupedByDate: { date: string; entries: Log[] }[] = [];
                for (const l of visibleLogs) {
                    const dateKey = new Date(l.timestamp).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric', weekday: 'short'
                    });
                    const last = groupedByDate[groupedByDate.length - 1];
                    if (last && last.date === dateKey) {
                        last.entries.push(l);
                    } else {
                        groupedByDate.push({ date: dateKey, entries: [l] });
                    }
                }
                return (
                    <Card>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Activity History</h3>
                            <span className="text-xs text-muted-foreground">
                                {filteredLogs.length === logs.length
                                    ? `${logs.length} entries`
                                    : `${filteredLogs.length} of ${logs.length}`}
                            </span>
                        </div>
                        {logs.length > 0 && (
                            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={activitySearch}
                                        onChange={(e) => { setActivitySearch(e.target.value); setActivityVisibleCount(50); }}
                                        placeholder="Search user, item, action..."
                                        className="w-full h-9 pl-3 pr-8 rounded-lg bg-muted text-foreground text-sm border border-transparent focus:bg-background focus:border-primary focus:outline-none transition-all"
                                    />
                                    {activitySearch && (
                                        <button
                                            onClick={() => setActivitySearch('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            aria-label="Clear search"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                <select
                                    value={activityActionFilter}
                                    onChange={(e) => { setActivityActionFilter(e.target.value); setActivityVisibleCount(50); }}
                                    className="h-9 px-3 rounded-lg bg-muted text-foreground text-sm border border-transparent focus:bg-background focus:border-primary focus:outline-none transition-all"
                                >
                                    <option value="ALL">All actions</option>
                                    {distinctActions.map(a => (
                                        <option key={a} value={a}>{formatLogAction(a)}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="max-h-[28rem] overflow-y-auto pr-1">
                            {logs.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-3 italic">No activity recorded</p>
                            ) : filteredLogs.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-3 italic">No entries match your filters</p>
                            ) : (
                                <>
                                    {groupedByDate.map(group => (
                                        <div key={group.date} className="mb-2 last:mb-0">
                                            <div className="sticky top-0 z-10 -mx-1 px-1 bg-card/95 backdrop-blur-sm py-1 mb-1">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.date}</p>
                                            </div>
                                            {group.entries.map(log => {
                                                const isCheckout = log.action === 'CHECKOUT' && log.entityId === transactionId;
                                                const checkoutItems = isCheckout ? getCheckoutLogItems(log) : [];
                                                const expandable = isCheckout && checkoutItems.length > 0;
                                                const isExpanded = expandedLogIds.has(log.id);
                                                return (
                                                    <div key={log.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                                                        <div
                                                            className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0 mt-0.5"
                                                            title={log.userId ? `User ID: ${log.userId}` : 'No user attribution'}
                                                        >
                                                            {getUserAvatarChar(log.userId)}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-muted-foreground italic leading-relaxed">
                                                                <span
                                                                    className={`font-medium not-italic ${log.userId && !allUsers.find(u => u.id === log.userId) ? 'text-muted-foreground/70 line-through' : 'text-foreground'}`}
                                                                    title={log.userId && !allUsers.find(u => u.id === log.userId) ? `Deleted user (${log.userId})` : undefined}
                                                                >
                                                                    {getUserName(log.userId)}
                                                                </span>
                                                                {' — '}
                                                                {formatLogDetails(log.details) || formatLogAction(log.action)}
                                                                {expandable && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setExpandedLogIds(prev => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(log.id)) next.delete(log.id);
                                                                            else next.add(log.id);
                                                                            return next;
                                                                        })}
                                                                        className="ml-1 inline-flex items-center gap-0.5 not-italic font-semibold text-primary hover:underline"
                                                                    >
                                                                        {isExpanded ? 'Hide items' : `Show ${checkoutItems.length} item${checkoutItems.length === 1 ? '' : 's'}`}
                                                                        <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                                        </svg>
                                                                    </button>
                                                                )}
                                                            </p>
                                                            {expandable && isExpanded && (
                                                                <ul className="mt-1 ml-1 space-y-0.5 text-[11px] text-foreground/80 list-disc list-inside">
                                                                    {checkoutItems.map((label, i) => (
                                                                        <li key={`${log.id}-item-${i}`} className="not-italic">{label}</li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                                                {formatLogTimestamp(log.timestamp)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                    {filteredLogs.length > activityVisibleCount && (
                                        <button
                                            onClick={() => setActivityVisibleCount(c => c + 50)}
                                            className="w-full mt-2 py-2 text-xs font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors"
                                        >
                                            Load {Math.min(50, filteredLogs.length - activityVisibleCount)} more
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </Card>
                );
            })()}

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
