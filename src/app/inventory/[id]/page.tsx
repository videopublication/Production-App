'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { storage } from '@/lib/storage';
import { Equipment, EquipmentStatus, Condition, Log, Transaction, Shoot, EquipmentIssueSeverity, EquipmentIssueType } from '@/types';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { useAuth } from '@/lib/auth';
import Image from 'next/image';

import { useEquipmentItem, useUpdateEquipment } from '@/hooks/useEquipment';
import { useUsers } from '@/hooks/useUsers';
import { useDepartment } from '@/lib/department-context';
import { getDepartmentLabels } from '@/lib/department-labels';
import { areManualItemsComplete } from '@/lib/transaction-manual-items';
import {
    EQUIPMENT_ISSUE_SEVERITY_LABELS,
    EQUIPMENT_ISSUE_SEVERITY_OPTIONS,
    EQUIPMENT_ISSUE_TYPE_LABELS,
    EQUIPMENT_ISSUE_TYPE_OPTIONS,
    conditionToIssueSeverity,
    conditionToIssueType,
    getEquipmentIssue,
    getIssueSummary,
    isIssueCondition,
    issueToCondition,
    withActiveIssue,
} from '@/lib/equipment-issues';
import { sendPushNotification } from '@/lib/push-notifications';

export default function ItemDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();

    const id = params?.id as string;
    const { data: item, isLoading } = useEquipmentItem(id);
    const { mutateAsync: updateEquipment } = useUpdateEquipment();
    const { data: users = [] } = useUsers();

    const [qrCode, setQrCode] = useState<string>('');
    const [assignedUser, setAssignedUser] = useState<string>('');

    // Item History Timeline state
    const [itemLogs, setItemLogs] = useState<Log[]>([]);
    const [itemTransactions, setItemTransactions] = useState<Transaction[]>([]);
    const [currentShoot, setCurrentShoot] = useState<Shoot | null>(null);
    const [historyLoading, setHistoryLoading] = useState(true);
    const HISTORY_INITIAL = 8;
    const HISTORY_BATCH = 20;
    const [historyVisible, setHistoryVisible] = useState(HISTORY_INITIAL);
    const { department } = useDepartment();
    const labels = getDepartmentLabels(department);
    const effectiveDeptId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);

    // Management state
    const [isEditing, setIsEditing] = useState(false);
    const [editStatus, setEditStatus] = useState<EquipmentStatus>('AVAILABLE');
    const [editCondition, setEditCondition] = useState<Condition>('OK');
    const [editLocation, setEditLocation] = useState('');
    const [editName, setEditName] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [editBarcode, setEditBarcode] = useState('');
    const [editSerialNumber, setEditSerialNumber] = useState('');
    const [editBrand, setEditBrand] = useState('');
    const [editModel, setEditModel] = useState('');
    const [editSize, setEditSize] = useState('');
    const [editHasActiveIssue, setEditHasActiveIssue] = useState(false);
    const [editIssueNote, setEditIssueNote] = useState('');
    const [showIssueForm, setShowIssueForm] = useState(false);
    const [issueType, setIssueType] = useState<EquipmentIssueType>('PHYSICAL_DAMAGE');
    const [issueSeverity, setIssueSeverity] = useState<EquipmentIssueSeverity>('USABLE_WITH_WARNING');
    const [issueNote, setIssueNote] = useState('');
    const [resolutionNote, setResolutionNote] = useState('');
    const [isIssueSaving, setIsIssueSaving] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [actionSaving, setActionSaving] = useState<null | 'return' | 'verify'>(null);
    const [showVerifyPanel, setShowVerifyPanel] = useState(false);
    const [verifyNote, setVerifyNote] = useState('');

    useEffect(() => {
        if (item) {
            // Initialize edit fields
            setEditStatus(item.status);
            setEditCondition(item.condition);
            setEditLocation(item.location);
            setEditName(item.name);
            setEditCategory(item.category);
            setEditBarcode(item.barcode);
            setEditSerialNumber(item.serialNumber || '');
            setEditBrand(item.metadata?.brand || '');
            setEditModel(item.metadata?.model || '');
            setEditSize(item.metadata?.size || '');
            const activeIssue = getEquipmentIssue(item);
            setEditHasActiveIssue(!!activeIssue);
            setEditIssueNote(activeIssue?.note || '');
            setIssueType(activeIssue?.issueType || 'PHYSICAL_DAMAGE');
            setIssueSeverity(activeIssue?.severity || 'USABLE_WITH_WARNING');
            setIssueNote('');
            setResolutionNote('');

            // QR & Assigned User Logic
            const generateQR = async () => {
                try {
                    const data = JSON.stringify({ id: item.id, barcode: item.barcode });
                    const QRCode = (await import('qrcode')).default;
                    const url = await QRCode.toDataURL(data, { width: 300 });
                    setQrCode(url);
                } catch (err) {
                    console.error(err);
                }
            };
            generateQR();

            if (item.assignedTo) {
                const foundUser = users.find(u => u.id === item.assignedTo);
                setAssignedUser(foundUser ? foundUser.name : item.assignedTo);
            }
        }
    }, [item, users]);

    // Load item history (logs + transactions + shoots)
    useEffect(() => {
        if (!item) return;
        const loadHistory = async () => {
            setHistoryLoading(true);
            try {
                const [equipmentLogs, txns, shoots] = await Promise.all([
                    storage.getLogsByEntity(item.id),
                    storage.getTransactions(undefined, undefined, undefined, 'ALL', undefined, undefined, effectiveDeptId),
                    storage.getShoots(effectiveDeptId || undefined)
                ]);

                // Filter transactions that include this item
                const relatedTxns = txns.filter(t => t.items.includes(item.id));
                setItemTransactions(relatedTxns);

                // Also fetch logs from each related transaction (checkout/return logs use transactionId as entityId)
                const txnIds = relatedTxns.map(t => t.id);
                const txnLogPromises = txnIds.map(txnId => storage.getLogsByEntity(txnId));
                const txnLogsArrays = await Promise.all(txnLogPromises);
                const allTxnLogs = txnLogsArrays.flat();

                // Filter transaction logs to only those relevant to THIS specific item
                // Strategy:
                //   - CHECKOUT logs: always include (they're transaction-wide, and we already know
                //     these transactions contain this item). These don't mention individual items.
                //   - RETURN/VERIFY/EDIT logs: filter by unique identifiers (barcode, ID) to
                //     exclude logs for OTHER items in the same transaction.
                //   - Use barcode/ID only — NOT item name (shared across variants like ZOOM-1 vs ZOOM-2)
                const uniqueIds = [item.id, item.barcode].filter(Boolean).map(s => s.toLowerCase());
                const txnLogs = allTxnLogs.filter(log => {
                    // CHECKOUT logs are per-transaction ("Checked out X items for Project")
                    // Since we only fetched logs from transactions containing this item, include them
                    if (log.action === 'CHECKOUT') return true;
                    // All other logs: only include if they specifically mention this item
                    const details = (log.details || '').toLowerCase();
                    return uniqueIds.some(uid => details.includes(uid));
                });

                // Merge equipment-level + filtered transaction-level logs, deduplicate by ID, sort by date
                const allLogsMap = new Map<string, Log>();
                [...equipmentLogs, ...txnLogs].forEach(log => {
                    allLogsMap.set(log.id, log);
                });
                const mergedLogs = Array.from(allLogsMap.values())
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                setItemLogs(mergedLogs);

                // Find current shoot if item is checked out
                if (item.status === 'CHECKED_OUT') {
                    const activeTransaction = relatedTxns.find(t => t.status === 'OPEN');
                    if (activeTransaction?.shootId) {
                        const shoot = shoots.find(s => s.id === activeTransaction.shootId) || null;
                        setCurrentShoot(shoot);
                    } else {
                        setCurrentShoot(null);
                    }
                } else {
                    setCurrentShoot(null);
                }
            } catch (err) {
                console.error('Failed to load item history:', err);
            } finally {
                setHistoryLoading(false);
            }
        };
        loadHistory();
    }, [item, effectiveDeptId]);

    // Check if current user can manage equipment
    const canManage = user && ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);
    // Admin can edit everything including critical fields
    const canEditEverything = user && ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
    const activeIssue = getEquipmentIssue(item);

    const notifyManagersAboutIssue = async (title: string, message: string) => {
        if (!item) return;
        const recipients = users.filter(u =>
            u.status === 'ACTIVE' &&
            ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(u.role) &&
            u.id !== user?.id
        );

        if (recipients.length === 0) return;

        const link = `/inventory/${encodeURIComponent(item.barcode)}`;
        await Promise.all(recipients.map(recipient =>
            storage.addNotification({
                userId: recipient.id,
                title,
                message,
                link,
                departmentId: item.departmentId || effectiveDeptId
            })
        ));

        sendPushNotification({
            userIds: recipients.map(recipient => recipient.id),
            title,
            message,
            link
        }).catch(error => console.error('Equipment issue push notification failed', error));
    };

    const handleReportIssue = async () => {
        if (!item || !user || isIssueSaving) return;

        if (!issueNote.trim()) {
            setSaveMessage('Issue note is required');
            setTimeout(() => setSaveMessage(''), 3000);
            return;
        }

        const nextIssue = {
            condition: issueToCondition(issueType, issueSeverity),
            issueType,
            severity: issueSeverity,
            note: issueNote.trim(),
            source: 'crew_report' as const,
            reportedAt: new Date().toISOString(),
            reportedBy: user.id,
            reporterName: user.name,
        };

        setIsIssueSaving(true);
        try {
            await updateEquipment({
                id: item.id,
                updates: {
                    condition: nextIssue.condition,
                    metadata: withActiveIssue(item.metadata, nextIssue),
                }
            });

            const issueSummary = getIssueSummary(nextIssue);
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: item.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details: `Reported issue for "${item.name}" (${item.barcode}): ${issueSummary}. ${nextIssue.note}`,
                oldValue: activeIssue,
                newValue: nextIssue,
                departmentId: item.departmentId || effectiveDeptId || undefined
            });

            await notifyManagersAboutIssue(
                'Equipment Issue Reported',
                `${item.name}: ${issueSummary}`
            );

            setShowIssueForm(false);
            setIssueNote('');
            setSaveMessage('Issue reported successfully. Managers have been notified.');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error('Failed to report issue:', err);
            setSaveMessage('Failed to report issue');
            setTimeout(() => setSaveMessage(''), 3000);
        } finally {
            setIsIssueSaving(false);
        }
    };

    const handleClearIssue = async () => {
        if (!item || !user || !canManage || isIssueSaving) return;

        setIsIssueSaving(true);
        try {
            await updateEquipment({
                id: item.id,
                updates: {
                    condition: 'OK',
                    metadata: withActiveIssue(item.metadata, null),
                }
            });

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'VERIFY',
                entityId: item.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details: `Cleared issue for "${item.name}" (${item.barcode})${resolutionNote.trim() ? `: ${resolutionNote.trim()}` : ''}`,
                oldValue: activeIssue,
                newValue: { cleared: true, resolutionNote: resolutionNote.trim() || undefined },
                departmentId: item.departmentId || effectiveDeptId || undefined
            });

            setResolutionNote('');
            setSaveMessage('Issue cleared successfully');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error('Failed to clear issue:', err);
            setSaveMessage('Failed to clear issue');
            setTimeout(() => setSaveMessage(''), 3000);
        } finally {
            setIsIssueSaving(false);
        }
    };

    const handleMoveToMaintenance = async () => {
        if (!item || !user || !canManage || isIssueSaving) return;

        setIsIssueSaving(true);
        try {
            await updateEquipment({
                id: item.id,
                updates: {
                    status: 'MAINTENANCE',
                    condition: 'DAMAGED',
                    assignedTo: null as unknown as string,
                }
            });

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: item.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details: `Moved "${item.name}" (${item.barcode}) to maintenance${resolutionNote.trim() ? `: ${resolutionNote.trim()}` : ''}`,
                oldValue: { status: item.status, condition: item.condition },
                newValue: { status: 'MAINTENANCE', condition: 'DAMAGED' },
                departmentId: item.departmentId || effectiveDeptId || undefined
            });

            setSaveMessage('Item moved to maintenance successfully');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error('Failed to move item to maintenance:', err);
            setSaveMessage('Failed to move item to maintenance');
            setTimeout(() => setSaveMessage(''), 3000);
        } finally {
            setIsIssueSaving(false);
        }
    };

    // Handle save changes
    // Handle save changes
    const handleSaveChanges = async () => {
        if (!item || !canManage) return;

        if (editStatus === 'AVAILABLE' && isIssueCondition(editCondition) && !editHasActiveIssue) {
            setSaveMessage('Available items with a non-OK condition need an active issue note');
            setTimeout(() => setSaveMessage(''), 3000);
            return;
        }

        if (editHasActiveIssue && !editIssueNote.trim()) {
            setSaveMessage('Issue note is required');
            setTimeout(() => setSaveMessage(''), 3000);
            return;
        }

        setIsSaving(true);
        try {
            const existingIssue = getEquipmentIssue(item);
            const nextCondition = editHasActiveIssue ? issueToCondition(issueType, issueSeverity) : editCondition;
            const editedIssue = editHasActiveIssue
                ? {
                    issueType,
                    severity: issueSeverity,
                    condition: nextCondition,
                    note: editIssueNote.trim(),
                    source: existingIssue?.source || ('manual' as const),
                    reportedAt: existingIssue?.reportedAt || new Date().toISOString(),
                    reportedBy: existingIssue?.reportedBy || user?.id,
                    reporterName: existingIssue?.reporterName || user?.name,
                    verifiedAt: existingIssue?.verifiedAt,
                    verifiedBy: existingIssue?.verifiedBy,
                }
                : null;

            const updates: Partial<Equipment> = {
                status: editStatus,
                condition: nextCondition,
                location: editLocation,
                // Clear assignedTo if status is AVAILABLE
                assignedTo: editStatus === 'AVAILABLE' ? null as unknown as string : item.assignedTo,
                metadata: withActiveIssue(item.metadata, editedIssue),
            };

            // Only add critical fields if user is ADMIN and they have changed
            if (canEditEverything) {
                updates.name = editName;
                updates.category = editCategory;
                updates.barcode = editBarcode;
                updates.serialNumber = editSerialNumber || undefined;
                updates.metadata = {
                    ...(updates.metadata || {}),
                    brand: editBrand.trim() || undefined,
                    model: editModel.trim() || undefined,
                    size: editSize.trim() || undefined,
                };
            }

            await updateEquipment({ id: item.id, updates });

            // Log update
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'EDIT',
                entityId: item.id,
                userId: user.id,
                timestamp: new Date().toISOString(),
                details: `Updated item "${item.name}" (${item.barcode}). Status: ${editStatus}, Condition: ${nextCondition}${editedIssue ? `, Issue: ${getIssueSummary(editedIssue)} - ${editedIssue.note}` : ''}`,
                departmentId: item.departmentId || effectiveDeptId || undefined
            });

            setIsEditing(false);
            setSaveMessage('Changes saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error('Failed to save:', err);
            setSaveMessage('Failed to save changes');
            setTimeout(() => setSaveMessage(''), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    // Cancel editing
    const handleCancelEdit = () => {
        if (item) {
            setEditStatus(item.status);
            setEditCondition(item.condition);
            setEditLocation(item.location);
            setEditName(item.name);
            setEditCategory(item.category);
            setEditBarcode(item.barcode);
            setEditSerialNumber(item.serialNumber || '');
            setEditBrand(item.metadata?.brand || '');
            setEditModel(item.metadata?.model || '');
            setEditSize(item.metadata?.size || '');
            const activeIssue = getEquipmentIssue(item);
            setEditHasActiveIssue(!!activeIssue);
            setEditIssueNote(activeIssue?.note || '');
            setIssueType(activeIssue?.issueType || 'PHYSICAL_DAMAGE');
            setIssueSeverity(activeIssue?.severity || 'USABLE_WITH_WARNING');
        }
        setIsEditing(false);
    };

    // The open transaction this item is currently out on (if any).
    const activeTransaction = itemTransactions.find(t => t.status === 'OPEN' && t.items.includes(item?.id || ''));

    // Force-return this item straight to AVAILABLE on behalf of the holder, and close
    // the transaction if it was the last item out. Mirrors the transaction page flow so
    // managers can resolve a stuck item without hunting for its transaction.
    const handleForceReturnItem = async () => {
        if (!item || !canManage) return;
        const holderName = (item.assignedTo && users.find(u => u.id === item.assignedTo)?.name)
            || (activeTransaction && users.find(u => u.id === activeTransaction.userId)?.name)
            || 'the user';
        if (!window.confirm(`Force return "${item.name}"? It will be marked AVAILABLE on behalf of ${holderName}.`)) return;

        setActionSaving('return');
        try {
            await updateEquipment({
                id: item.id,
                updates: {
                    status: 'AVAILABLE',
                    assignedTo: null as unknown as string,
                    lastActivity: new Date().toISOString(),
                },
            });

            let closedTxn = false;
            if (activeTransaction) {
                const updatedConditions: Record<string, Condition> = {
                    ...(activeTransaction.postReturnConditions || {}),
                    [item.id]: 'OK',
                };
                const allReturned = activeTransaction.items.every(id => updatedConditions[id] !== undefined)
                    && areManualItemsComplete(activeTransaction.manualItems);
                const txnUpdates: Partial<Transaction> = { postReturnConditions: updatedConditions };
                if (allReturned) {
                    txnUpdates.status = 'CLOSED';
                    txnUpdates.timestampIn = new Date().toISOString();
                    closedTxn = true;
                }
                await storage.updateTransaction(activeTransaction.id, txnUpdates);
            }

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'RETURN',
                entityId: activeTransaction?.id || item.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: `Force-returned item "${item.name}" (${item.barcode}) on behalf of ${holderName} - Verified by ${user!.name}${closedTxn ? ' (Transaction Closed)' : ''}`,
                departmentId: effectiveDeptId || undefined,
            });

            setSaveMessage(`${item.name} force-returned successfully.`);
        } catch (err) {
            console.error('Force return failed:', err);
            setSaveMessage('Failed to force return item.');
        } finally {
            setActionSaving(null);
        }
    };

    // Verify a pending item back into stock. Mirrors the verification page: outcomes are
    // Available (clean), Available-with-issue (keeps a note/condition), or Maintenance.
    const handleVerifyItem = async (
        status: 'AVAILABLE' | 'MAINTENANCE',
        options?: { issueNote?: string; keepAvailableWithIssue?: boolean }
    ) => {
        if (!item || !canManage) return;
        const note = options?.issueNote?.trim();
        if ((status === 'MAINTENANCE' || options?.keepAvailableWithIssue) && !note) {
            setSaveMessage('Please add a note describing the issue.');
            return;
        }

        setActionSaving('verify');
        try {
            const cleanVerify = status === 'AVAILABLE' && !options?.keepAvailableWithIssue;
            const issueCondition: Condition = isIssueCondition(item.condition)
                ? item.condition
                : (status === 'MAINTENANCE' ? 'NOT_FUNCTIONING' : 'DAMAGED');
            const existingIssue = getEquipmentIssue(item);
            const activeIssue = note
                ? {
                    condition: issueCondition,
                    issueType: conditionToIssueType(issueCondition),
                    severity: conditionToIssueSeverity(issueCondition),
                    note,
                    source: 'verification' as const,
                    reportedAt: existingIssue?.reportedAt || new Date().toISOString(),
                    reportedBy: existingIssue?.reportedBy,
                    reporterName: existingIssue?.reporterName,
                    verifiedAt: new Date().toISOString(),
                    verifiedBy: user?.id,
                }
                : null;
            const nextCondition: Condition = cleanVerify ? 'OK' : issueCondition;

            await updateEquipment({
                id: item.id,
                updates: {
                    status,
                    condition: nextCondition,
                    assignedTo: null as unknown as string,
                    lastActivity: new Date().toISOString(),
                    metadata: withActiveIssue(item.metadata, activeIssue),
                },
            });

            const projectText = activeTransaction ? ` for project "${activeTransaction.project || 'Unspecified'}"` : '';
            const issueText = activeIssue ? `, Issue: ${getIssueSummary(activeIssue)} - ${activeIssue.note}` : '';
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'VERIFY',
                entityId: item.id,
                userId: user!.id,
                timestamp: new Date().toISOString(),
                details: `Verified item "${item.name}" (${item.barcode}) as ${status}${issueText}${projectText}`,
                departmentId: effectiveDeptId || undefined,
            });

            if (activeTransaction) {
                const updatedConditions: Record<string, Condition> = {
                    ...(activeTransaction.postReturnConditions || {}),
                    [item.id]: cleanVerify ? 'OK' : nextCondition,
                };
                const allReturned = activeTransaction.items.every(id => updatedConditions[id] !== undefined)
                    && areManualItemsComplete(activeTransaction.manualItems);
                const txnUpdates: Partial<Transaction> = { postReturnConditions: updatedConditions };
                if (allReturned) {
                    txnUpdates.status = 'CLOSED';
                    txnUpdates.timestampIn = new Date().toISOString();
                }
                await storage.updateTransaction(activeTransaction.id, txnUpdates);
            }

            setShowVerifyPanel(false);
            setVerifyNote('');
            setSaveMessage(`${item.name} verified as ${status === 'MAINTENANCE' ? 'sent to maintenance' : 'available'}.`);
        } catch (err) {
            console.error('Verify failed:', err);
            setSaveMessage('Failed to verify item.');
        } finally {
            setActionSaving(null);
        }
    };

    const downloadLabel = async () => {
        if (!item || !qrCode) return;

        try {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: [50, 30], // 50mm x 30mm label
                compress: true
            });

            doc.addImage(qrCode, 'PNG', 2, 2, 26, 26);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(item.barcode, 30, 8);

            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            const nameLines = doc.splitTextToSize(item.name, 18);
            doc.text(nameLines, 30, 12);

            doc.text(item.category, 30, 20);

            doc.save(`${item.barcode}-label.pdf`);
        } catch (err) {
            console.error('Failed to generate label:', err);
        }
    };

    const getStatusVariant = (status: string): 'default' | 'destructive' | 'success' | 'warning' | 'orange' => {
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

    const getDisplayStatus = (currentItem: Equipment) => {
        if (currentItem.status === 'AVAILABLE' && getEquipmentIssue(currentItem)) return 'ISSUE';
        return currentItem.status.replace('_', ' ');
    };

    const getDisplayStatusVariant = (currentItem: Equipment) => {
        if (currentItem.status === 'AVAILABLE' && getEquipmentIssue(currentItem)) return 'warning';
        return getStatusVariant(currentItem.status);
    };

    if (isLoading) return <div className="p-8 text-center">Loading...</div>;
    if (isLoading) return <div className="p-8 text-center">Loading...</div>;
    if (!item) return (
        <div className="p-8 text-center space-y-4">
            <h3 className="text-lg font-semibold">Item not found</h3>
            <p className="text-muted-foreground text-sm">
                Could not find equipment with ID or Barcode: <span className="font-mono bg-secondary px-1 py-0.5 rounded">{id}</span>
            </p>
            <Button onClick={() => router.push('/inventory')} variant="secondary">
                Back to Inventory
            </Button>
        </div>
    );

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            {/* Desktop-only Back row — the mobile app header already shows Back, and Print
                QR now lives on the QR Code card below. Static, so it never overlaps content. */}
            <div className="hidden md:flex -mx-4 items-center border-b border-border/40 px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-sm transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    <span>Inventory</span>
                </button>
            </div>

            {/* Header Section - Clean Mobile Layout */}
            <div className="space-y-4">
                {/* Hero Section: Equipment Name + Status */}
                <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/30">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            {isEditing && canEditEverything ? (
                                <div className="space-y-2 mb-2">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="w-full text-2xl sm:text-3xl font-bold tracking-tight text-foreground bg-transparent border-b border-input focus:border-primary focus:outline-none px-0"
                                        placeholder="Item Name"
                                    />
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={editCategory}
                                            onChange={(e) => setEditCategory(e.target.value)}
                                            className="text-sm text-muted-foreground bg-transparent border-b border-input focus:border-primary focus:outline-none w-32"
                                            placeholder="Category"
                                        />
                                        <span className="text-muted-foreground">•</span>
                                        <input
                                            type="text"
                                            value={editBarcode}
                                            onChange={(e) => setEditBarcode(e.target.value)}
                                            className="text-sm text-muted-foreground bg-transparent border-b border-input focus:border-primary focus:outline-none w-32 font-mono"
                                            placeholder="Barcode"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
                                            {item.name}
                                        </h1>
                                        {item.metadata?.size && (
                                            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded bg-secondary text-foreground/70 border border-border/60 whitespace-nowrap">
                                                {item.metadata.size}
                                            </span>
                                        )}
                                    </div>
                                    {(() => {
                                        const detail = [item.metadata?.brand, item.metadata?.model].filter(Boolean).join(' · ');
                                        return detail ? (
                                            <p className="text-sm font-medium text-foreground/75 mt-1">{detail}</p>
                                        ) : null;
                                    })()}
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        {item.category} • {item.barcode}
                                    </p>
                                </>
                            )}
                        </div>
                        <Badge variant={getDisplayStatusVariant(item)} className="shrink-0 text-xs font-semibold px-2.5 py-1">
                            {getDisplayStatus(item)}
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">Item Issue Status</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {labels.teamPlural} can report problems here. Active issues appear in Needs Attention and during checkout.
                        </p>
                    </div>
                    {!activeIssue && (
                        <button
                            type="button"
                            onClick={() => setShowIssueForm(prev => !prev)}
                            className="inline-flex h-10 items-center justify-center rounded-full bg-amber-500 px-4 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                        >
                            {showIssueForm ? 'Cancel' : 'Report Issue'}
                        </button>
                    )}
                </div>

                {activeIssue ? (
                    <div className={`mt-4 rounded-2xl border p-4 ${activeIssue.severity === 'NOT_USABLE'
                        ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100'
                        : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
                        }`}>
                        <div className="flex items-start gap-3">
                            <svg className="mt-0.5 h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            </svg>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-bold">{EQUIPMENT_ISSUE_TYPE_LABELS[activeIssue.issueType]}</span>
                                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-bold dark:bg-white/10">
                                        {EQUIPMENT_ISSUE_SEVERITY_LABELS[activeIssue.severity]}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm leading-relaxed">{activeIssue.note}</p>
                                <p className="mt-2 text-xs opacity-80">
                                    Reported {activeIssue.reporterName ? `by ${activeIssue.reporterName} ` : ''}
                                    {activeIssue.reportedAt ? new Date(activeIssue.reportedAt).toLocaleString() : ''}
                                </p>
                            </div>
                        </div>

                        {canManage && (
                            <div className="mt-4 space-y-3">
                                <textarea
                                    value={resolutionNote}
                                    onChange={(e) => setResolutionNote(e.target.value)}
                                    className="min-h-[84px] w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-background/80"
                                    placeholder="Manager note before clearing or moving to maintenance..."
                                />
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={handleClearIssue}
                                        disabled={isIssueSaving}
                                        className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
                                    >
                                        Clear Issue
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleMoveToMaintenance}
                                        disabled={isIssueSaving}
                                        className="inline-flex h-10 items-center justify-center rounded-full border border-current px-4 text-sm font-bold disabled:opacity-60"
                                    >
                                        Move to Maintenance
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {showIssueForm && (
                            <div className="mt-4 grid gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20 sm:grid-cols-2">
                                <label className="space-y-1.5">
                                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Issue Type</span>
                                    <select
                                        value={issueType}
                                        onChange={(e) => setIssueType(e.target.value as EquipmentIssueType)}
                                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        {EQUIPMENT_ISSUE_TYPE_OPTIONS.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-1.5">
                                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Severity</span>
                                    <select
                                        value={issueSeverity}
                                        onChange={(e) => setIssueSeverity(e.target.value as EquipmentIssueSeverity)}
                                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        {EQUIPMENT_ISSUE_SEVERITY_OPTIONS.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                    <span className="block text-xs text-muted-foreground">
                                        {EQUIPMENT_ISSUE_SEVERITY_OPTIONS.find(option => option.value === issueSeverity)?.description}
                                    </span>
                                </label>
                                <label className="space-y-1.5 sm:col-span-2">
                                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">What is the issue?</span>
                                    <textarea
                                        value={issueNote}
                                        onChange={(e) => setIssueNote(e.target.value)}
                                        className="min-h-[112px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                                        placeholder="Example: Works normally, but the battery door is loose."
                                    />
                                </label>
                                <div className="sm:col-span-2">
                                    <button
                                        type="button"
                                        onClick={handleReportIssue}
                                        disabled={isIssueSaving}
                                        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60 sm:w-auto"
                                    >
                                        {isIssueSaving ? 'Reporting...' : 'Submit Issue'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {item.status === 'AVAILABLE' && isIssueCondition(item.condition) && (
                            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                                <p className="text-sm font-bold">This item has a non-OK condition but no active issue note.</p>
                                <p className="mt-1 text-sm">Use Report Issue so checkout users can see what needs attention.</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Manager quick actions.
                - CHECKED_OUT: item is still out → Force Return (mark returned + available).
                - PENDING_VERIFICATION: item is already returned, only awaiting a decision
                  → Verify (with condition outcome), no force return. */}
            {canManage && (item.status === 'CHECKED_OUT' || item.status === 'PENDING_VERIFICATION') && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">Manager actions</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.status === 'CHECKED_OUT'
                                    ? 'Item is checked out. Force it back into stock if the holder cannot return it.'
                                    : 'Item is returned and awaiting verification. Verify it back into stock.'}
                            </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                            {item.status === 'PENDING_VERIFICATION' && (
                                <button
                                    onClick={() => setShowVerifyPanel(v => !v)}
                                    disabled={actionSaving !== null}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-green-500 px-4 text-sm font-bold text-white transition-colors hover:bg-green-600 disabled:opacity-60"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    Verify
                                </button>
                            )}
                            {item.status === 'CHECKED_OUT' && (
                                <button
                                    onClick={handleForceReturnItem}
                                    disabled={actionSaving !== null}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-orange-500 px-4 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                                    </svg>
                                    {actionSaving === 'return' ? 'Returning…' : 'Force Return'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Verify outcome panel — choose the item's condition, like the Verification page */}
                    {item.status === 'PENDING_VERIFICATION' && showVerifyPanel && (
                        <div className="mt-4 space-y-3 border-t border-primary/15 pt-4">
                            <label className="block">
                                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                    Issue note (required for damaged / maintenance)
                                </span>
                                <textarea
                                    value={verifyNote}
                                    onChange={(e) => setVerifyNote(e.target.value)}
                                    rows={2}
                                    placeholder="e.g. Lens cap missing, records fine"
                                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                                />
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => handleVerifyItem('AVAILABLE')}
                                    disabled={actionSaving !== null}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-green-500 px-4 text-sm font-bold text-white transition-colors hover:bg-green-600 disabled:opacity-60"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    {actionSaving === 'verify' ? 'Saving…' : 'Available (OK)'}
                                </button>
                                <button
                                    onClick={() => handleVerifyItem('AVAILABLE', { issueNote: verifyNote, keepAvailableWithIssue: true })}
                                    disabled={actionSaving !== null}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-amber-500 px-4 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:opacity-60"
                                >
                                    Available with issue
                                </button>
                                <button
                                    onClick={() => handleVerifyItem('MAINTENANCE', { issueNote: verifyNote })}
                                    disabled={actionSaving !== null}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-red-500 px-4 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
                                >
                                    Send to Maintenance
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <Card>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Item Details
                            </h3>
                            {/* Edit/Save buttons for managers/admins */}
                            {canManage && (
                                <div className="flex gap-2">
                                    {!isEditing ? (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            Edit
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={handleCancelEdit}
                                                disabled={isSaving}
                                                className="text-sm text-muted-foreground hover:text-foreground font-medium"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleSaveChanges}
                                                disabled={isSaving}
                                                className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                                            >
                                                {isSaving ? (
                                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                                Save
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Success/Error Message */}
                        {saveMessage && (
                            <div className={`mb-4 p-2 rounded-lg text-sm font-medium ${saveMessage.includes('success') ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                                {saveMessage}
                            </div>
                        )}

                        <dl className="space-y-5 flex-1">
                            {/* Barcode ID - Editable for ADMIN */}
                            <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                    </svg>
                                    Barcode ID
                                </dt>
                                {isEditing && canEditEverything ? (
                                    <input
                                        type="text"
                                        value={editBarcode}
                                        onChange={(e) => setEditBarcode(e.target.value)}
                                        className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent w-full max-w-[150px] font-mono text-right"
                                    />
                                ) : (
                                    <dd className="font-mono text-sm bg-background px-2 py-1 rounded border border-border">{item.barcode}</dd>
                                )}
                            </div>

                            {/* Serial Number - Editable for ADMIN */}
                            {(item.serialNumber || (isEditing && canEditEverything)) && (
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                        </svg>
                                        Serial Number
                                    </dt>
                                    {isEditing && canEditEverything ? (
                                        <input
                                            type="text"
                                            value={editSerialNumber}
                                            onChange={(e) => setEditSerialNumber(e.target.value)}
                                            placeholder="Empty"
                                            className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent w-full max-w-[150px] text-right"
                                        />
                                    ) : (
                                        <dd className="text-sm font-medium">{item.serialNumber || 'N/A'}</dd>
                                    )}
                                </div>
                            )}

                            {/* Brand - Editable for ADMIN */}
                            {(item.metadata?.brand || (isEditing && canEditEverything)) && (
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                        </svg>
                                        Brand
                                    </dt>
                                    {isEditing && canEditEverything ? (
                                        <input
                                            type="text"
                                            value={editBrand}
                                            onChange={(e) => setEditBrand(e.target.value)}
                                            placeholder="Empty"
                                            className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent w-full max-w-[150px] text-right"
                                        />
                                    ) : (
                                        <dd className="text-sm font-medium">{item.metadata?.brand}</dd>
                                    )}
                                </div>
                            )}

                            {/* Model - Editable for ADMIN */}
                            {(item.metadata?.model || (isEditing && canEditEverything)) && (
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                        </svg>
                                        Model
                                    </dt>
                                    {isEditing && canEditEverything ? (
                                        <input
                                            type="text"
                                            value={editModel}
                                            onChange={(e) => setEditModel(e.target.value)}
                                            placeholder="Empty"
                                            className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent w-full max-w-[150px] text-right"
                                        />
                                    ) : (
                                        <dd className="text-sm font-medium">{item.metadata?.model}</dd>
                                    )}
                                </div>
                            )}

                            {/* Size - Editable for ADMIN */}
                            {(item.metadata?.size || (isEditing && canEditEverything)) && (
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2m8-16h2a2 2 0 012 2v2m-4 12h2a2 2 0 002-2v-2M9 12h6" />
                                        </svg>
                                        Size
                                    </dt>
                                    {isEditing && canEditEverything ? (
                                        <input
                                            type="text"
                                            value={editSize}
                                            onChange={(e) => setEditSize(e.target.value)}
                                            placeholder="Empty"
                                            className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent w-full max-w-[150px] text-right"
                                        />
                                    ) : (
                                        <dd className="text-sm font-medium">{item.metadata?.size}</dd>
                                    )}
                                </div>
                            )}

                            {/* Category - Editable for ADMIN */}
                            <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                    Category
                                </dt>
                                {isEditing && canEditEverything ? (
                                    <input
                                        type="text"
                                        value={editCategory}
                                        onChange={(e) => setEditCategory(e.target.value)}
                                        className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent w-full max-w-[150px] text-right"
                                    />
                                ) : (
                                    <dd className="text-sm font-medium">{item.category}</dd>
                                )}
                            </div>

                            {/* Status - Editable for managers/admins */}
                            {canManage && (
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Status
                                    </dt>
                                    {isEditing ? (
                                        <select
                                            value={editStatus}
                                            onChange={(e) => setEditStatus(e.target.value as EquipmentStatus)}
                                            className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent"
                                        >
                                            <option value="AVAILABLE">Available</option>
                                            <option value="CHECKED_OUT">Checked Out</option>
                                            <option value="PENDING_VERIFICATION">Pending Verification</option>
                                            <option value="MAINTENANCE">Maintenance</option>
                                            <option value="DAMAGED">Damaged</option>
                                            <option value="LOST">Lost</option>
                                        </select>
                                    ) : (
                                        <Badge variant={getDisplayStatusVariant(item)}>
                                            {getDisplayStatus(item)}
                                        </Badge>
                                    )}
                                </div>
                            )}

                            {/* Location - Editable */}
                            <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Location
                                </dt>
                                {isEditing && canManage ? (
                                    <input
                                        type="text"
                                        value={editLocation}
                                        onChange={(e) => setEditLocation(e.target.value)}
                                        className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent w-32 text-right"
                                    />
                                ) : (
                                    <dd className="text-sm font-medium">{item.location}</dd>
                                )}
                            </div>

                            {isEditing && canManage && (
                                <div className="space-y-4 rounded-2xl border border-amber-300/70 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-amber-950 dark:text-amber-100">Active Issue</p>
                                            <p className="mt-0.5 text-xs font-medium leading-relaxed text-amber-800 dark:text-amber-300">
                                                Use this when the item is usable with a warning or should be blocked from checkout.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setEditHasActiveIssue(prev => !prev)}
                                            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${editHasActiveIssue
                                                ? 'bg-amber-500 text-black'
                                                : 'bg-background text-muted-foreground border border-border'
                                                }`}
                                        >
                                            {editHasActiveIssue ? 'On' : 'Off'}
                                        </button>
                                    </div>

                                    {editHasActiveIssue && (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="space-y-1.5">
                                                <span className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Issue Type</span>
                                                <select
                                                    value={issueType}
                                                    onChange={(e) => setIssueType(e.target.value as EquipmentIssueType)}
                                                    className="h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-800 dark:bg-background"
                                                >
                                                    {EQUIPMENT_ISSUE_TYPE_OPTIONS.map(option => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="space-y-1.5">
                                                <span className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Severity</span>
                                                <select
                                                    value={issueSeverity}
                                                    onChange={(e) => setIssueSeverity(e.target.value as EquipmentIssueSeverity)}
                                                    className="h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-800 dark:bg-background"
                                                >
                                                    {EQUIPMENT_ISSUE_SEVERITY_OPTIONS.map(option => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="space-y-1.5 sm:col-span-2">
                                                <span className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Issue Note</span>
                                                <textarea
                                                    value={editIssueNote}
                                                    onChange={(e) => setEditIssueNote(e.target.value)}
                                                    className="min-h-[104px] w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-800 dark:bg-background"
                                                    placeholder="Example: Fully working, but audio input is noisy."
                                                />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!isEditing && getEquipmentIssue(item) && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
                                    <div className="mb-1 flex items-center gap-2 font-semibold">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        </svg>
                                        {getIssueSummary(getEquipmentIssue(item)!)}
                                    </div>
                                    <p className="leading-relaxed">{getEquipmentIssue(item)?.note}</p>
                                </div>
                            )}

                            {/* Condition - Editable */}
                            <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                <dt className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Condition
                                </dt>
                                {isEditing && canManage && editHasActiveIssue ? (
                                    <dd className="max-w-[180px] text-right text-sm font-semibold text-amber-600 dark:text-amber-300">
                                        Managed by issue
                                    </dd>
                                ) : isEditing && canManage ? (
                                    <select
                                        value={editCondition}
                                        onChange={(e) => setEditCondition(e.target.value as Condition)}
                                        className="text-sm px-2 py-1 rounded border border-border bg-background focus:ring-2 focus:ring-primary focus:border-transparent"
                                    >
                                        <option value="OK">OK</option>
                                        <option value="SCRATCHES">Scratches</option>
                                        <option value="NOT_FUNCTIONING">Not Functioning</option>
                                        <option value="NEEDS_BATTERY">Needs Battery</option>
                                        <option value="LOOSE_MOUNT">Loose Mount</option>
                                        <option value="DAMAGED">Damaged</option>
                                    </select>
                                ) : (
                                    <dd className="text-sm font-medium">{item.condition.replace('_', ' ')}</dd>
                                )}
                            </div>

                        </dl>
                    </Card>

                    {item.status !== 'AVAILABLE' && item.assignedTo && (
                        <Card className="bg-primary/5 border-primary/20">
                            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-primary">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                Current Assignment
                            </h3>
                            <div className="space-y-4">
                                {/* Assigned User */}
                                <div className="flex items-center space-x-4">
                                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                                        {assignedUser.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground">Assigned to {assignedUser}</p>
                                        {(() => {
                                            const activeTxn = itemTransactions.find(t => t.status === 'OPEN');
                                            return activeTxn ? (
                                                <p className="text-sm text-muted-foreground">
                                                    Since {new Date(activeTxn.timestampOut).toLocaleDateString()} •{' '}
                                                    <Link
                                                        href={`/transactions/${activeTxn.id}`}
                                                        className="font-medium text-primary underline-offset-2 hover:underline"
                                                    >
                                                        {activeTxn.id}
                                                    </Link>
                                                </p>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">Active</p>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Linked Shoot Details */}
                                {currentShoot && (
                                    <div className="bg-background/80 rounded-xl p-3.5 border border-border/50 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            <span className="text-sm font-semibold text-foreground">{currentShoot.title}</span>
                                            {currentShoot.shootNumber && (
                                                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">#{currentShoot.shootNumber}</span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                            {currentShoot.location && (
                                                <span className="flex items-center gap-1">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                    </svg>
                                                    {currentShoot.location}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                {new Date(currentShoot.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                {currentShoot.endTime && ` - ${new Date(currentShoot.endTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                                            </span>
                                        </div>
                                        {currentShoot.pocName && (
                                            <p className="text-xs text-muted-foreground">
                                                POC: {currentShoot.pocName}{currentShoot.pocContact ? ` • ${currentShoot.pocContact}` : ''}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Transaction Project — links to the shoot when one is
                                    attached. CREW aren't linked through here: the shoot page
                                    only lets assigned crew in, so a link would often dead-end
                                    on Access Denied. Managers/admins/finance always link. */}
                                {(() => {
                                    const activeTxn = itemTransactions.find(t => t.status === 'OPEN');
                                    if (!activeTxn?.project) return null;
                                    const canOpenShoot = activeTxn.shootId && user?.role !== 'CREW';
                                    return (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="font-medium">Project:</span>
                                            {canOpenShoot ? (
                                                <Link
                                                    href={`/shoots/${activeTxn.shootId}`}
                                                    className="font-medium text-primary underline-offset-2 hover:underline"
                                                >
                                                    {activeTxn.project}
                                                </Link>
                                            ) : (
                                                <span>{activeTxn.project}</span>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </Card>
                    )}
                </div>

                <div className="space-y-6 h-full">
                    <Card className="h-full flex flex-col items-center justify-center p-8">
                        <h3 className="font-semibold text-lg mb-6 flex items-center gap-2 w-full">
                            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                            QR Code
                        </h3>
                        <div className="flex flex-col items-center space-y-6 flex-1 justify-center">
                            {qrCode && (
                                <div className="bg-white p-4 rounded-xl shadow-lg shadow-white/5">
                                    <Image src={qrCode} alt="QR Code" width={200} height={200} className="w-auto h-auto" />
                                </div>
                            )}
                            <p className="text-sm text-center text-muted-foreground max-w-xs">
                                Scan this code to quickly access item details or add to checkout.
                            </p>
                            <button
                                onClick={downloadLabel}
                                disabled={!qrCode}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print QR Label
                            </button>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Item History Timeline + Usage Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-12">
                {/* Usage Stats */}
                <Card className="lg:col-span-1">
                    <h3 className="font-semibold text-lg mb-5 flex items-center gap-2">
                        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Usage Stats
                    </h3>
                    {historyLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
                            ))}
                        </div>
                    ) : (() => {
                        const totalCheckouts = itemTransactions.length;
                        const lastTxn = itemTransactions[0];
                        const lastCheckoutUser = lastTxn ? users.find(u => u.id === lastTxn.userId) : null;
                        const daysSinceActivity = item.lastActivity
                            ? Math.floor((Date.now() - new Date(item.lastActivity).getTime()) / (1000 * 60 * 60 * 24))
                            : null;

                        return (
                            <dl className="space-y-3">
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm text-muted-foreground">Total Checkouts</dt>
                                    <dd className="text-lg font-bold text-primary">{totalCheckouts}</dd>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm text-muted-foreground">Last User</dt>
                                    <dd className="text-sm font-medium truncate max-w-[120px]">{lastCheckoutUser?.name || '\u2014'}</dd>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm text-muted-foreground">Last Project</dt>
                                    <dd className="text-sm font-medium truncate max-w-[120px]">{lastTxn?.project || '\u2014'}</dd>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm text-muted-foreground">Last Activity</dt>
                                    <dd className="text-sm font-medium">
                                        {daysSinceActivity !== null ? (
                                            daysSinceActivity === 0 ? 'Today' : `${daysSinceActivity}d ago`
                                        ) : '\u2014'}
                                    </dd>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-secondary/30 rounded-lg border border-border/50">
                                    <dt className="text-sm text-muted-foreground">Added</dt>
                                    <dd className="text-sm font-medium">
                                        {item.createdAt
                                            ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                            : '\u2014'}
                                    </dd>
                                </div>
                            </dl>
                        );
                    })()}
                </Card>

                {/* Item History Timeline */}
                <Card className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Item History
                        </h3>
                        <span className="text-xs text-muted-foreground">{itemLogs.length} events</span>
                    </div>

                    {historyLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="flex gap-3">
                                    <div className="w-8 h-8 bg-muted/50 rounded-full animate-pulse shrink-0" />
                                    <div className="flex-1 space-y-1.5">
                                        <div className="h-4 bg-muted/50 rounded w-3/4 animate-pulse" />
                                        <div className="h-3 bg-muted/30 rounded w-1/2 animate-pulse" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : itemLogs.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm">No activity recorded for this item</p>
                        </div>
                    ) : (
                        <div className="space-y-0">
                          <div className="max-h-[32rem] overflow-y-auto pr-1 -mr-1">
                            {itemLogs.slice(0, historyVisible).map((log, index) => {
                                const logUser = users.find(u => u.id === log.userId);
                                const relatedTxn = itemTransactions.find(t => t.id === log.entityId);
                                const isLast = index === Math.min(historyVisible, itemLogs.length) - 1;

                                const getActionIcon = (action: string) => {
                                    switch (action) {
                                        case 'CHECKOUT': return { icon: '\u2197', bg: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' };
                                        case 'RETURN': return { icon: '\u2199', bg: 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary' };
                                        case 'VERIFY': return { icon: '\u2713', bg: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' };
                                        case 'EDIT': return { icon: '\u270e', bg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' };
                                        case 'CREATE': return { icon: '+', bg: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' };
                                        default: return { icon: '\u2022', bg: 'bg-gray-100 dark:bg-gray-800 text-gray-500' };
                                    }
                                };

                                const { icon, bg } = getActionIcon(log.action);
                                const logDate = new Date(log.timestamp);

                                return (
                                    <div key={log.id} className="flex gap-3 group">
                                        {/* Timeline line + icon */}
                                        <div className="flex flex-col items-center">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${bg}`}>
                                                {icon}
                                            </div>
                                            {!isLast && (
                                                <div className="w-px flex-1 min-h-[16px] bg-border/60" />
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className={`flex-1 min-w-0 ${!isLast ? 'pb-4' : ''}`}>
                                            <div className="flex items-baseline gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-foreground">
                                                    {log.action.charAt(0) + log.action.slice(1).toLowerCase()}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    by {logUser?.name || 'System'}
                                                </span>
                                            </div>
                                            {log.details && (
                                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                                                    {log.details}
                                                </p>
                                            )}
                                            {relatedTxn?.project && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/5 border border-primary/10 px-1.5 py-0.5 rounded mt-1">
                                                    🎬 {relatedTxn.project}
                                                </span>
                                            )}
                                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                                                {logDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                {' \u2022 '}
                                                {logDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                          </div>

                            {itemLogs.length > HISTORY_INITIAL && (
                                <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                                    {historyVisible < itemLogs.length && (
                                        <button
                                            onClick={() => setHistoryVisible(v => Math.min(v + HISTORY_BATCH, itemLogs.length))}
                                            className="py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                                        >
                                            Show more ({itemLogs.length - historyVisible} remaining)
                                        </button>
                                    )}
                                    {historyVisible > HISTORY_INITIAL && (
                                        <button
                                            onClick={() => setHistoryVisible(HISTORY_INITIAL)}
                                            className="py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            Show less
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
