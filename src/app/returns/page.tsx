'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storage } from '@/lib/storage';
import { Condition, EquipmentIssueSeverity, EquipmentIssueType } from '@/types';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast-context';
import { useEquipment, useUpdateEquipment } from '@/hooks/useEquipment';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTransactions } from '@/hooks/useTransactions';
import { useAssignments } from '@/hooks/useAssignments';
import { useDepartment } from '@/lib/department-context';
import { sendPushNotification } from '@/lib/push-notifications';
import {
    CONDITION_LABELS,
    EQUIPMENT_ISSUE_SEVERITY_OPTIONS,
    EQUIPMENT_ISSUE_TYPE_OPTIONS,
    conditionToIssueSeverity,
    conditionToIssueType,
    getIssueSummary,
    isIssueCondition,
    issueToCondition,
    withActiveIssue
} from '@/lib/equipment-issues';

const compareByName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

export default function ReturnsPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { data: allItems = [], isLoading: isInventoryLoading } = useEquipment();
    const { mutateAsync: updateEquipment } = useUpdateEquipment();
    const { showToast } = useToast();
    const isOnline = useOnlineStatus();

    const { data: allTransactions = [] } = useTransactions();
    const { data: allAssignments = [] } = useAssignments();
    const { department } = useDepartment();
    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;

    // Derive checked out items from transactions where the user is involved
    const checkedOutItems = React.useMemo(() => {
        if (!user || !allItems || !allTransactions) return [];

        // Determine relevant OPEN transactions
        const relevantTxns = allTransactions.filter(txn => {
            if (txn.status !== 'OPEN') return false;

            const isPrimary = txn.userId === user.id;

            // If transaction is linked to a shoot, strictly follow shoot assignments (Source of Truth)
            if (txn.shootId) {
                const assignment = allAssignments.find(a =>
                    a.shootId === txn.shootId &&
                    a.userId === user.id &&
                    ['ACCEPTED', 'PENDING'].includes(a.status)
                );
                // Only Primary Creator OR Active Crew can see/return
                return isPrimary || !!assignment;
            }

            // For non-shoot transactions, use static snapshot
            const isAdditional = txn.additionalUsers?.includes(user.id);
            return isPrimary || isAdditional;
        });

        // Collect all item IDs from these transactions
        const relevantItemIds = new Set<string>();
        relevantTxns.forEach(txn => {
            txn.items.forEach(id => relevantItemIds.add(id));
        });

        // Return equipment details
        return allItems.filter(i =>
            relevantItemIds.has(i.id) &&
            i.status === 'CHECKED_OUT'
        ).sort(compareByName);
    }, [user, allItems, allTransactions, allAssignments]);

    const manualReturnItems = React.useMemo(() => {
        if (!user || !allTransactions || !allAssignments) return [];

        return allTransactions
            .filter(txn => {
                if (txn.status !== 'OPEN') return false;
                const isPrimary = txn.userId === user.id;
                if (txn.shootId) {
                    const assignment = allAssignments.find(a =>
                        a.shootId === txn.shootId &&
                        a.userId === user.id &&
                        ['ACCEPTED', 'PENDING'].includes(a.status)
                    );
                    return isPrimary || !!assignment;
                }
                return isPrimary || txn.additionalUsers?.includes(user.id);
            })
            .flatMap(txn => (txn.manualItems || [])
                .filter(item => item.returnRequired && item.status === 'OUT')
                .map(item => ({ transaction: txn, item, key: `${txn.id}:${item.id}` }))
            )
            .sort((a, b) => a.item.name.localeCompare(b.item.name, undefined, { sensitivity: 'base', numeric: true }));
    }, [user, allTransactions, allAssignments]);

    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [selectedManualItems, setSelectedManualItems] = useState<string[]>([]);
    const [conditions, setConditions] = useState<Record<string, Condition>>({});
    const [issueTypes, setIssueTypes] = useState<Record<string, EquipmentIssueType>>({});
    const [issueSeverities, setIssueSeverities] = useState<Record<string, EquipmentIssueSeverity>>({});
    const [issueNotes, setIssueNotes] = useState<Record<string, string>>({});

    useEffect(() => {
        if (authLoading) return;

        if (!user) router.replace('/login');
    }, [user, router, authLoading]);

    if (authLoading || isInventoryLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const toggleSelection = (id: string) => {
        if (selectedItems.includes(id)) {
            setSelectedItems(selectedItems.filter(i => i !== id));
            const newConditions = { ...conditions };
            const newIssueTypes = { ...issueTypes };
            const newIssueSeverities = { ...issueSeverities };
            const newIssueNotes = { ...issueNotes };
            delete newConditions[id];
            delete newIssueTypes[id];
            delete newIssueSeverities[id];
            delete newIssueNotes[id];
            setConditions(newConditions);
            setIssueTypes(newIssueTypes);
            setIssueSeverities(newIssueSeverities);
            setIssueNotes(newIssueNotes);
        } else {
            setSelectedItems([...selectedItems, id]);
            setConditions({ ...conditions, [id]: 'OK' });
            setIssueTypes({ ...issueTypes, [id]: 'PHYSICAL_DAMAGE' });
            setIssueSeverities({ ...issueSeverities, [id]: 'USABLE_WITH_WARNING' });
        }
    };

    const setReturnMode = (id: string, hasIssue: boolean) => {
        if (!hasIssue) {
            setConditions({ ...conditions, [id]: 'OK' });
            const newIssueNotes = { ...issueNotes };
            delete newIssueNotes[id];
            setIssueNotes(newIssueNotes);
            return;
        }

        const type = issueTypes[id] || 'PHYSICAL_DAMAGE';
        const severity = issueSeverities[id] || 'USABLE_WITH_WARNING';
        setIssueTypes({ ...issueTypes, [id]: type });
        setIssueSeverities({ ...issueSeverities, [id]: severity });
        setConditions({ ...conditions, [id]: issueToCondition(type, severity) });
    };

    const handleIssueTypeChange = (id: string, type: EquipmentIssueType) => {
        const severity = issueSeverities[id] || 'USABLE_WITH_WARNING';
        setIssueTypes({ ...issueTypes, [id]: type });
        setConditions({ ...conditions, [id]: issueToCondition(type, severity) });
    };

    const handleIssueSeverityChange = (id: string, severity: EquipmentIssueSeverity) => {
        const type = issueTypes[id] || 'PHYSICAL_DAMAGE';
        setIssueSeverities({ ...issueSeverities, [id]: severity });
        setConditions({ ...conditions, [id]: issueToCondition(type, severity) });
    };

    const handleIssueNoteChange = (id: string, note: string) => {
        setIssueNotes({ ...issueNotes, [id]: note });
    };

    const toggleManualSelection = (key: string) => {
        if (selectedManualItems.includes(key)) {
            setSelectedManualItems(selectedManualItems.filter(i => i !== key));
            const newConditions = { ...conditions };
            const newIssueTypes = { ...issueTypes };
            const newIssueSeverities = { ...issueSeverities };
            const newIssueNotes = { ...issueNotes };
            delete newConditions[key];
            delete newIssueTypes[key];
            delete newIssueSeverities[key];
            delete newIssueNotes[key];
            setConditions(newConditions);
            setIssueTypes(newIssueTypes);
            setIssueSeverities(newIssueSeverities);
            setIssueNotes(newIssueNotes);
        } else {
            setSelectedManualItems([...selectedManualItems, key]);
            setConditions({ ...conditions, [key]: 'OK' });
            setIssueTypes({ ...issueTypes, [key]: 'PHYSICAL_DAMAGE' });
            setIssueSeverities({ ...issueSeverities, [key]: 'USABLE_WITH_WARNING' });
        }
    };

    const handleSubmitReturn = async () => {
        const selectedCount = selectedItems.length + selectedManualItems.length;
        if (selectedCount === 0) return;

        if (!isOnline) {
            showToast('You are offline. Please connect to the internet to return items.', 'error');
            return;
        }

        const missingIssueNoteId = [...selectedItems, ...selectedManualItems].find(id =>
            isIssueCondition(conditions[id]) && !issueNotes[id]?.trim()
        );

        if (missingIssueNoteId) {
            const item = allItems.find(i => i.id === missingIssueNoteId);
            showToast(`Add an issue note for ${item?.name || 'the damaged item'}`, 'warning');
            return;
        }

        try {
            await Promise.all(selectedItems.map(async (id) => {
                const item = allItems.find(i => i.id === id);
                const condition = conditions[id] || 'OK';
                const issueType = issueTypes[id] || conditionToIssueType(condition);
                const issueSeverity = issueSeverities[id] || conditionToIssueSeverity(condition);
                const issueNote = issueNotes[id]?.trim();
                const issueCondition = isIssueCondition(condition) ? issueToCondition(issueType, issueSeverity) : 'OK';

                await updateEquipment({
                    id,
                    updates: {
                        status: 'PENDING_VERIFICATION',
                        condition: issueCondition,
                        ...(item && isIssueCondition(condition) && issueNote ? {
                            metadata: withActiveIssue(item.metadata, {
                                condition: issueCondition,
                                issueType,
                                severity: issueSeverity,
                                note: issueNote,
                                source: 'return',
                                reportedAt: new Date().toISOString(),
                                reportedBy: user?.id,
                                reporterName: user?.name,
                            })
                        } : {})
                    }
                });

                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'RETURN',
                        entityId: id,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Submitted for return (${isIssueCondition(condition) ? `Issue: ${getIssueSummary({ condition: issueCondition, issueType, severity: issueSeverity, note: issueNote || '', source: 'return' })}${issueNote ? `, Note: ${issueNote}` : ''}` : `Condition: ${CONDITION_LABELS.OK}`})`,
                        departmentId: activeDepartmentId || undefined
                    });
                }
            }));

            const selectedManualByTxn = new Map<string, typeof manualReturnItems>();
            selectedManualItems.forEach(key => {
                const row = manualReturnItems.find(manual => manual.key === key);
                if (!row) return;
                const existing = selectedManualByTxn.get(row.transaction.id) || [];
                selectedManualByTxn.set(row.transaction.id, [...existing, row]);
            });

            await Promise.all(Array.from(selectedManualByTxn.entries()).map(async ([transactionId, rows]) => {
                const txn = rows[0].transaction;
                const updatedManualItems = (txn.manualItems || []).map(manualItem => {
                    const row = rows.find(candidate => candidate.item.id === manualItem.id);
                    if (!row) return manualItem;

                    const key = row.key;
                    const condition = conditions[key] || 'OK';
                    const issueType = issueTypes[key] || conditionToIssueType(condition);
                    const issueSeverity = issueSeverities[key] || conditionToIssueSeverity(condition);
                    const issueNote = issueNotes[key]?.trim();

                    return {
                        ...manualItem,
                        status: 'PENDING_VERIFICATION' as const,
                        returnedQuantity: manualItem.quantity,
                        returnCondition: isIssueCondition(condition) ? issueToCondition(issueType, issueSeverity) : 'OK',
                        issueType: isIssueCondition(condition) ? issueType : undefined,
                        issueSeverity: isIssueCondition(condition) ? issueSeverity : undefined,
                        returnNote: issueNote || undefined,
                        returnedAt: new Date().toISOString(),
                        returnedBy: user?.id,
                    };
                });

                await storage.updateTransaction(transactionId, { manualItems: updatedManualItems });

                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'RETURN',
                        entityId: transactionId,
                        userId: user.id,
                        timestamp: new Date().toISOString(),
                        details: `Submitted ${rows.length} manual item${rows.length === 1 ? '' : 's'} for return verification`,
                        departmentId: activeDepartmentId || undefined
                    });
                }
            }));

            // Send Push Notification to Managers
            try {
                const allUsers = await storage.getUsers(activeDepartmentId);
                const managers = allUsers.filter(u =>
                    u.status === 'ACTIVE' &&
                    ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(u.role)
                );

                if (managers.length > 0) {
                    const title = 'Items Returned';
                    const message = `${user?.name || 'A user'} has returned ${selectedCount} items. Verification required.`;

                    const pushPromise = sendPushNotification({
                        userIds: managers.map(manager => manager.id),
                        title,
                        message,
                        link: '/verification'
                    }).catch(e => console.error('Failed to send return push notifications', e));

                    const dbPromises = managers.map(manager =>
                        storage.addNotification({
                            userId: manager.id,
                            title,
                            message,
                            link: '/verification',
                            departmentId: activeDepartmentId
                        })
                    );

                    await Promise.all([pushPromise, ...dbPromises]);
                }
            } catch (e) {
                console.error("Failed to send notifications", e);
            }

            showToast('Items submitted for verification', 'success');
            setSelectedItems([]);
            setSelectedManualItems([]);
            setConditions({});
            setIssueTypes({});
            setIssueSeverities({});
            setIssueNotes({});
        } catch (error) {
            console.error('Submit return failed:', error);
            showToast('Failed to return items. Please check your connection and try again.', 'error');
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Returns</h1>
                <Button
                    onClick={handleSubmitReturn}
                    disabled={(selectedItems.length + selectedManualItems.length) === 0 || !isOnline}
                    className="w-full sm:w-auto"
                    size="sm"
                >
                    {!isOnline ? 'Offline' : `Return Selected (${selectedItems.length + selectedManualItems.length})`}
                </Button>
            </div>

            {!isOnline && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-800 animate-in slide-in-from-top-2">
                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm font-medium">
                        You are currently offline. Please connect to the internet to submit returns.
                    </p>
                </div>
            )}

            {checkedOutItems.length === 0 && manualReturnItems.length === 0 ? (
                <div className="text-center py-10 sm:py-12 border-2 border-dashed border-border rounded-lg text-muted-foreground text-sm">
                    You have no items to return.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                    {checkedOutItems.map((item) => (
                        <Card
                            key={item.id}
                            className={`cursor-pointer transition-all ${selectedItems.includes(item.id) ? 'ring-2 ring-primary border-transparent' : ''}`}
                        >
                            <div className="flex items-start justify-between mb-3 sm:mb-4" onClick={() => toggleSelection(item.id)}>
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-semibold text-base sm:text-lg truncate">{item.name}</h3>
                                    <p className="text-xs sm:text-sm text-muted-foreground truncate">{item.category} • {item.barcode}</p>
                                </div>
                                <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center shrink-0 ml-2 ${selectedItems.includes(item.id) ? 'border-primary bg-primary text-white' : 'border-muted'}`}>
                                    {selectedItems.includes(item.id) && (
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                            </div>

                            {selectedItems.includes(item.id) && (
                                <div className="mt-3 space-y-3 border-t border-border pt-3 sm:mt-4 sm:pt-4" onClick={(e) => e.stopPropagation()}>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Return Status</p>
                                        <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-secondary/60 p-1">
                                            <button
                                                type="button"
                                                onClick={() => setReturnMode(item.id, false)}
                                                className={`h-11 rounded-xl text-sm font-bold transition-colors ${!isIssueCondition(conditions[item.id])
                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                            >
                                                OK
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReturnMode(item.id, true)}
                                                className={`h-11 rounded-xl text-sm font-bold transition-colors ${isIssueCondition(conditions[item.id])
                                                    ? 'bg-amber-500 text-black shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                            >
                                                Report Issue
                                            </button>
                                        </div>
                                    </div>

                                    {isIssueCondition(conditions[item.id]) && (
                                        <div className="space-y-3 rounded-2xl border border-amber-300/70 bg-amber-50/80 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <label className="space-y-1.5">
                                                    <span className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Issue Type</span>
                                                    <select
                                                        value={issueTypes[item.id] || 'PHYSICAL_DAMAGE'}
                                                        onChange={(e) => handleIssueTypeChange(item.id, e.target.value as EquipmentIssueType)}
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
                                                        value={issueSeverities[item.id] || 'USABLE_WITH_WARNING'}
                                                        onChange={(e) => handleIssueSeverityChange(item.id, e.target.value as EquipmentIssueSeverity)}
                                                        className="h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-800 dark:bg-background"
                                                    >
                                                        {EQUIPMENT_ISSUE_SEVERITY_OPTIONS.map(option => (
                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>
                                            <label className="block space-y-1.5">
                                                <span className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Issue Note Required</span>
                                                <textarea
                                                    className="w-full min-h-[104px] rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-800 dark:bg-background"
                                                    value={issueNotes[item.id] || ''}
                                                    onChange={(e) => handleIssueNoteChange(item.id, e.target.value)}
                                                    placeholder="Describe the issue, e.g. audio is not working but the item is otherwise usable."
                                                />
                                            </label>
                                            <p className="text-xs font-medium leading-relaxed text-amber-800 dark:text-amber-300">
                                                Managers will see this in verification and the item will show an active issue warning until cleared.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>
                    ))}
                    {manualReturnItems.map(({ item, transaction, key }) => (
                        <Card
                            key={key}
                            className={`cursor-pointer transition-all border-amber-300/50 ${selectedManualItems.includes(key) ? 'ring-2 ring-amber-500 border-transparent' : ''}`}
                        >
                            <div className="flex items-start justify-between mb-3 sm:mb-4" onClick={() => toggleManualSelection(key)}>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                                        Manual
                                    </div>
                                    <h3 className="font-semibold text-base sm:text-lg truncate">{item.name}</h3>
                                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                                        Qty {item.quantity} • {transaction.project || 'Unspecified project'}
                                    </p>
                                    {item.notes && (
                                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.notes}</p>
                                    )}
                                </div>
                                <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center shrink-0 ml-2 ${selectedManualItems.includes(key) ? 'border-amber-500 bg-amber-500 text-black' : 'border-muted'}`}>
                                    {selectedManualItems.includes(key) && (
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                            </div>

                            {selectedManualItems.includes(key) && (
                                <div className="mt-3 space-y-3 border-t border-border pt-3 sm:mt-4 sm:pt-4" onClick={(e) => e.stopPropagation()}>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Return Status</p>
                                        <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-secondary/60 p-1">
                                            <button
                                                type="button"
                                                onClick={() => setReturnMode(key, false)}
                                                className={`h-11 rounded-xl text-sm font-bold transition-colors ${!isIssueCondition(conditions[key])
                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                            >
                                                OK
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReturnMode(key, true)}
                                                className={`h-11 rounded-xl text-sm font-bold transition-colors ${isIssueCondition(conditions[key])
                                                    ? 'bg-amber-500 text-black shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                            >
                                                Report Issue
                                            </button>
                                        </div>
                                    </div>

                                    {isIssueCondition(conditions[key]) && (
                                        <div className="space-y-3 rounded-2xl border border-amber-300/70 bg-amber-50/80 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <label className="space-y-1.5">
                                                    <span className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Issue Type</span>
                                                    <select
                                                        value={issueTypes[key] || 'PHYSICAL_DAMAGE'}
                                                        onChange={(e) => handleIssueTypeChange(key, e.target.value as EquipmentIssueType)}
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
                                                        value={issueSeverities[key] || 'USABLE_WITH_WARNING'}
                                                        onChange={(e) => handleIssueSeverityChange(key, e.target.value as EquipmentIssueSeverity)}
                                                        className="h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-800 dark:bg-background"
                                                    >
                                                        {EQUIPMENT_ISSUE_SEVERITY_OPTIONS.map(option => (
                                                            <option key={option.value} value={option.value}>{option.label}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>
                                            <label className="block space-y-1.5">
                                                <span className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Issue Note Required</span>
                                                <textarea
                                                    className="w-full min-h-[104px] rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-800 dark:bg-background"
                                                    value={issueNotes[key] || ''}
                                                    onChange={(e) => handleIssueNoteChange(key, e.target.value)}
                                                    placeholder="Describe the issue or missing quantity."
                                                />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
