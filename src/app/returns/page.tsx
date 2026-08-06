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
import { useShoots } from '@/hooks/useShoots';
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
    issueToCondition
} from '@/lib/equipment-issues';
import {
    getReturnVerificationMode,
    resolveEquipmentReturn,
    resolveManualItemReturn
} from '@/lib/return-verification';
import { areManualItemsComplete } from '@/lib/transaction-manual-items';
import { isCard, isDataAsset } from '@/lib/data-assets';
import { Equipment, ManualTransactionItem, Shoot, Transaction, TransactionDataReport } from '@/types';

const compareByName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

type ManualReturnRow = {
    transaction: Transaction;
    item: ManualTransactionItem;
    key: string;
};

type ReturnGroup = {
    key: string;
    title: string;
    date: string;
    timestamp: number;
    transactionIds: string[];
    items: Equipment[];
    manualItems: ManualReturnRow[];
};

type ReturnConditionLogInput = {
    condition: Condition;
    issueCondition: Condition;
    issueType: EquipmentIssueType;
    issueSeverity: EquipmentIssueSeverity;
    issueNote?: string;
};

const formatEquipmentReturnLabel = (item: Equipment | undefined, fallbackId: string) => {
    if (!item) return fallbackId;

    const serialNumber = item.serialNumber || item.metadata?.serialNumber;
    const identifiers = [
        item.barcode ? `Barcode: ${item.barcode}` : null,
        serialNumber ? `S/N: ${serialNumber}` : null,
    ].filter(Boolean);

    return identifiers.length > 0 ? `${item.name} (${identifiers.join(' | ')})` : item.name;
};

const formatManualReturnLabel = (row: ManualReturnRow) => {
    const project = row.transaction.project?.trim();
    const itemLabel = `${row.item.name} x${row.item.quantity}`;

    return project ? `${itemLabel} (${project})` : itemLabel;
};

const formatReturnConditionForLog = ({
    condition,
    issueCondition,
    issueType,
    issueSeverity,
    issueNote,
}: ReturnConditionLogInput) => {
    if (!isIssueCondition(condition)) return `Condition: ${CONDITION_LABELS.OK}`;

    const issueSummary = getIssueSummary({
        condition: issueCondition,
        issueType,
        severity: issueSeverity,
        note: issueNote || '',
        source: 'return',
    });

    return `Issue: ${issueSummary}${issueNote ? `, Note: ${issueNote}` : ''}`;
};

const getDateValue = (dateString?: string) => {
    if (!dateString) return 0;
    const time = new Date(dateString).getTime();
    return Number.isNaN(time) ? 0 : time;
};

const formatShortDate = (dateString?: string) => {
    if (!dateString) return 'No date';
    return new Date(dateString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

export default function ReturnsPage() {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { data: allItems = [], isLoading: isInventoryLoading } = useEquipment();
    const { mutateAsync: updateEquipment } = useUpdateEquipment();
    const { showToast } = useToast();
    const isOnline = useOnlineStatus();

    const { data: allTransactions = [] } = useTransactions();
    const { data: allAssignments = [] } = useAssignments();
    const { data: allShoots = [], isLoading: isShootsLoading } = useShoots();
    const { department, hasFeature } = useDepartment();
    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;

    const relevantTransactions = React.useMemo(() => {
        if (!user || !allTransactions || !allAssignments) return [];

        return allTransactions.filter(txn => {
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
    }, [user, allTransactions, allAssignments]);

    // Derive checked out items from transactions where the user is involved
    const checkedOutItems = React.useMemo(() => {
        if (!user || !allItems || !relevantTransactions) return [];

        // Collect all item IDs from these transactions
        const relevantItemIds = new Set<string>();
        relevantTransactions.forEach(txn => {
            txn.items.forEach(id => relevantItemIds.add(id));
        });

        // Return equipment details
        return allItems.filter(i =>
            relevantItemIds.has(i.id) &&
            i.status === 'CHECKED_OUT'
        ).sort(compareByName);
    }, [user, allItems, relevantTransactions]);

    const manualReturnItems = React.useMemo<ManualReturnRow[]>(() => {
        if (!user || !relevantTransactions) return [];

        return relevantTransactions
            .flatMap(txn => (txn.manualItems || [])
                .filter(item => item.returnRequired && item.status === 'OUT')
                .map(item => ({ transaction: txn, item, key: `${txn.id}:${item.id}` }))
            )
            .sort((a, b) => a.item.name.localeCompare(b.item.name, undefined, { sensitivity: 'base', numeric: true }));
    }, [user, relevantTransactions]);

    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [selectedManualItems, setSelectedManualItems] = useState<string[]>([]);
    const [conditions, setConditions] = useState<Record<string, Condition>>({});
    const [issueTypes, setIssueTypes] = useState<Record<string, EquipmentIssueType>>({});
    const [issueSeverities, setIssueSeverities] = useState<Record<string, EquipmentIssueSeverity>>({});
    const [issueNotes, setIssueNotes] = useState<Record<string, string>>({});
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const returnableItemIds = checkedOutItems.map(item => item.id);
    const returnableManualKeys = manualReturnItems.map(item => item.key);
    const totalReturnableCount = returnableItemIds.length + returnableManualKeys.length;
    const selectedCount = selectedItems.length + selectedManualItems.length;
    const allReturnableSelected = totalReturnableCount > 0
        && returnableItemIds.every(id => selectedItems.includes(id))
        && returnableManualKeys.every(key => selectedManualItems.includes(key));

    const returnGroups = React.useMemo<ReturnGroup[]>(() => {
        const groups: Record<string, ReturnGroup> = {};

        const getGroup = (txn?: Transaction, fallbackDate?: string) => {
            const linkedShoot = txn?.shootId ? allShoots.find((shoot: Shoot) => shoot.id === txn.shootId) : undefined;
            const key = linkedShoot ? `shoot:${linkedShoot.id}` : txn ? `transaction:${txn.id}` : 'unlinked';
            const shootPrefix = linkedShoot?.shootNumber ? `#${linkedShoot.shootNumber} ` : '';
            const title = linkedShoot
                ? `${shootPrefix}${linkedShoot.title}`
                : txn?.project && txn.project.trim() !== ''
                    ? txn.project
                    : 'General Return';
            const dateSource = linkedShoot?.startTime || txn?.timestampOut || fallbackDate;
            const timestamp = getDateValue(dateSource);

            if (!groups[key]) {
                groups[key] = {
                    key,
                    title,
                    date: formatShortDate(dateSource),
                    timestamp,
                    transactionIds: [],
                    items: [],
                    manualItems: [],
                };
            }

            if (txn && !groups[key].transactionIds.includes(txn.id)) {
                groups[key].transactionIds.push(txn.id);
            }

            return groups[key];
        };

        checkedOutItems.forEach(item => {
            const txn = relevantTransactions.find(transaction => transaction.items.includes(item.id));
            getGroup(txn, item.lastActivity).items.push(item);
        });

        manualReturnItems.forEach(row => {
            getGroup(row.transaction, row.transaction.timestampOut).manualItems.push(row);
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
    }, [checkedOutItems, manualReturnItems, relevantTransactions, allShoots]);

    // ---- Gear / Data split ----------------------------------------------------
    // The data team's items come back on their own tab: they always wait for the data team
    // (footage has to be copied off and the card wiped), and returning a card asks the one
    // question the app can't derive — whether the Zoom recorder was actually used.
    const showDataTab = hasFeature('data_assets') && checkedOutItems.some(isDataAsset);
    const [returnTab, setReturnTab] = useState<'GEAR' | 'DATA'>('GEAR');
    const activeTab = showDataTab ? returnTab : 'GEAR';

    const visibleGroups = React.useMemo<ReturnGroup[]>(() => {
        if (!showDataTab) return returnGroups;
        return returnGroups
            .map(group => ({
                ...group,
                items: group.items.filter(item => (activeTab === 'DATA' ? isDataAsset(item) : !isDataAsset(item))),
                // Manual items are part of the gear flow and carry no custodian.
                manualItems: activeTab === 'DATA' ? [] : group.manualItems,
            }))
            .filter(group => group.items.length > 0 || group.manualItems.length > 0);
    }, [returnGroups, activeTab, showDataTab]);

    // Which transactions have a card in this return, and therefore need the Zoom answer.
    const [zoomAnswers, setZoomAnswers] = useState<Record<string, boolean>>({});
    const cardTransactions = React.useMemo(() => {
        const map = new Map<string, string>(); // transactionId -> label
        selectedItems.forEach(id => {
            const item = allItems.find(i => i.id === id);
            if (!item || !isCard(item)) return;
            const txn = relevantTransactions.find(t => t.items.includes(id));
            if (!txn) return;
            const shoot = txn.shootId ? allShoots.find((s: Shoot) => s.id === txn.shootId) : undefined;
            map.set(txn.id, shoot?.title || txn.project || txn.id);
        });
        return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
    }, [selectedItems, allItems, relevantTransactions, allShoots]);
    const missingZoomAnswer = cardTransactions.some(t => zoomAnswers[t.id] === undefined);

    useEffect(() => {
        if (authLoading) return;

        if (!user) router.replace('/login');
    }, [user, router, authLoading]);

    if (authLoading || isInventoryLoading || isShootsLoading) {
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

    const toggleSelectAllReturns = () => {
        if (allReturnableSelected) {
            setSelectedItems([]);
            setSelectedManualItems([]);
            setConditions({});
            setIssueTypes({});
            setIssueSeverities({});
            setIssueNotes({});
            return;
        }

        setSelectedItems(returnableItemIds);
        setSelectedManualItems(returnableManualKeys);
        setConditions(prev => {
            const next = { ...prev };
            [...returnableItemIds, ...returnableManualKeys].forEach(id => {
                if (!next[id]) next[id] = 'OK';
            });
            return next;
        });
        setIssueTypes(prev => {
            const next = { ...prev };
            [...returnableItemIds, ...returnableManualKeys].forEach(id => {
                if (!next[id]) next[id] = 'PHYSICAL_DAMAGE';
            });
            return next;
        });
        setIssueSeverities(prev => {
            const next = { ...prev };
            [...returnableItemIds, ...returnableManualKeys].forEach(id => {
                if (!next[id]) next[id] = 'USABLE_WITH_WARNING';
            });
            return next;
        });
    };

    const toggleGroupExpanded = (groupKey: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) {
                next.delete(groupKey);
            } else {
                next.add(groupKey);
            }
            return next;
        });
    };

    const toggleGroupSelection = (group: ReturnGroup) => {
        const itemIds = group.items.map(item => item.id);
        const manualKeys = group.manualItems.map(row => row.key);
        const allSelected = itemIds.every(id => selectedItems.includes(id))
            && manualKeys.every(key => selectedManualItems.includes(key));

        if (allSelected) {
            const keysToRemove = new Set([...itemIds, ...manualKeys]);
            setSelectedItems(prev => prev.filter(id => !keysToRemove.has(id)));
            setSelectedManualItems(prev => prev.filter(key => !keysToRemove.has(key)));
            setConditions(prev => {
                const next = { ...prev };
                keysToRemove.forEach(key => delete next[key]);
                return next;
            });
            setIssueTypes(prev => {
                const next = { ...prev };
                keysToRemove.forEach(key => delete next[key]);
                return next;
            });
            setIssueSeverities(prev => {
                const next = { ...prev };
                keysToRemove.forEach(key => delete next[key]);
                return next;
            });
            setIssueNotes(prev => {
                const next = { ...prev };
                keysToRemove.forEach(key => delete next[key]);
                return next;
            });
            return;
        }

        setSelectedItems(prev => Array.from(new Set([...prev, ...itemIds])));
        setSelectedManualItems(prev => Array.from(new Set([...prev, ...manualKeys])));
        setConditions(prev => {
            const next = { ...prev };
            [...itemIds, ...manualKeys].forEach(id => {
                if (!next[id]) next[id] = 'OK';
            });
            return next;
        });
        setIssueTypes(prev => {
            const next = { ...prev };
            [...itemIds, ...manualKeys].forEach(id => {
                if (!next[id]) next[id] = 'PHYSICAL_DAMAGE';
            });
            return next;
        });
        setIssueSeverities(prev => {
            const next = { ...prev };
            [...itemIds, ...manualKeys].forEach(id => {
                if (!next[id]) next[id] = 'USABLE_WITH_WARNING';
            });
            return next;
        });
    };

    const handleSubmitReturn = async () => {
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

        // The data team's report needs this and can't derive it, so it's mandatory —
        // the whole point of replacing the form is that the answer is never blank.
        if (missingZoomAnswer) {
            showToast('Answer whether the Zoom recorder was used', 'warning');
            return;
        }

        try {
            // How much sign-off this department wants: 'none' releases clean returns
            // immediately, 'checkout' holds them for the next person picking them up, and
            // 'manager' holds everything. A reported issue always waits for a manager.
            const mode = getReturnVerificationMode(department);
            const now = new Date().toISOString();
            const actor = { id: user?.id, name: user?.name };

            // Manual items live JSON-encoded inside transactions.notes, and every write does a
            // read-modify-write of that column — so each transaction gets exactly ONE update,
            // with its condition records, manual items and closure merged together.
            type TxnPatch = {
                transaction: Transaction;
                conditions: Record<string, Condition>;
                manualItems?: ManualTransactionItem[];
                manualLogDetails?: string;
                manualLogCount?: number;
                dataReport?: TransactionDataReport;
            };
            const txnPatches = new Map<string, TxnPatch>();
            const patchFor = (txn: Transaction): TxnPatch => {
                const existing = txnPatches.get(txn.id);
                if (existing) return existing;
                const created: TxnPatch = { transaction: txn, conditions: {} };
                txnPatches.set(txn.id, created);
                return created;
            };

            let releasedCount = 0;
            let pendingCount = 0;

            // ---- Inventory items ----------------------------------------------------
            await Promise.all(selectedItems.map(async (id) => {
                const item = allItems.find(i => i.id === id);
                const condition = conditions[id] || 'OK';
                const issueType = issueTypes[id] || conditionToIssueType(condition);
                const issueSeverity = issueSeverities[id] || conditionToIssueSeverity(condition);
                const issueNote = issueNotes[id]?.trim();
                const issueCondition = isIssueCondition(condition) ? issueToCondition(issueType, issueSeverity) : 'OK';
                const conditionDetail = formatReturnConditionForLog({
                    condition,
                    issueCondition,
                    issueType,
                    issueSeverity,
                    issueNote,
                });

                const disposition = resolveEquipmentReturn({
                    item,
                    report: { condition, issueType, issueSeverity, issueNote },
                    mode,
                    actor,
                    now,
                });

                await updateEquipment({ id, updates: disposition.updates });

                if (disposition.selfReleased) releasedCount++;
                else pendingCount++;

                // Recording the condition is what lets the transaction close — it is the key
                // every closing path checks. Managers record it themselves on verification.
                if (disposition.conditionToRecord) {
                    const txn = relevantTransactions.find(t => t.items.includes(id));
                    if (txn) patchFor(txn).conditions[id] = disposition.conditionToRecord;
                }

                if (user) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'RETURN',
                        entityId: id,
                        userId: user.id,
                        timestamp: now,
                        details: disposition.selfReleased
                            ? `Returned ${formatEquipmentReturnLabel(item, id)} (${conditionDetail}) - released without manager verification, no issue reported`
                            : `Submitted ${formatEquipmentReturnLabel(item, id)} for return (${conditionDetail})`,
                        newValue: { selfVerified: disposition.selfReleased },
                        departmentId: activeDepartmentId || undefined
                    });
                }
            }));

            // ---- Manual items -------------------------------------------------------
            const selectedManualByTxn = new Map<string, typeof manualReturnItems>();
            selectedManualItems.forEach(key => {
                const row = manualReturnItems.find(manual => manual.key === key);
                if (!row) return;
                const existing = selectedManualByTxn.get(row.transaction.id) || [];
                selectedManualByTxn.set(row.transaction.id, [...existing, row]);
            });

            selectedManualByTxn.forEach((rows) => {
                const txn = rows[0].transaction;
                const patch = patchFor(txn);
                const logParts: string[] = [];

                patch.manualItems = (txn.manualItems || []).map(manualItem => {
                    const row = rows.find(candidate => candidate.item.id === manualItem.id);
                    if (!row) return manualItem;

                    const key = row.key;
                    const condition = conditions[key] || 'OK';
                    const issueType = issueTypes[key] || conditionToIssueType(condition);
                    const issueSeverity = issueSeverities[key] || conditionToIssueSeverity(condition);
                    const issueNote = issueNotes[key]?.trim();
                    const issueCondition = isIssueCondition(condition) ? issueToCondition(issueType, issueSeverity) : 'OK';

                    const resolved = resolveManualItemReturn({
                        manualItem,
                        report: { condition, issueType, issueSeverity, issueNote },
                        mode,
                        actor,
                        now,
                    });

                    if (resolved.selfVerified) releasedCount++;
                    else pendingCount++;

                    logParts.push(`${formatManualReturnLabel(row)} (${formatReturnConditionForLog({
                        condition,
                        issueCondition,
                        issueType,
                        issueSeverity,
                        issueNote,
                    })})`);

                    return resolved;
                });

                patch.manualLogDetails = logParts.join('; ');
                patch.manualLogCount = rows.length;
            });

            // ---- Zoom recorder answer ------------------------------------------------
            // Cards go to the data team's queue rather than being released, so their
            // transaction may have no patch yet — create one so the answer is still saved.
            cardTransactions.forEach(({ id }) => {
                const txn = relevantTransactions.find(t => t.id === id);
                if (!txn) return;
                patchFor(txn).dataReport = {
                    ...(txn.dataReport || {}),
                    zoomRecorderUsed: zoomAnswers[id],
                    answeredAt: now,
                    answeredBy: user?.id,
                };
            });

            // ---- One write per transaction ------------------------------------------
            for (const [transactionId, patch] of txnPatches) {
                const txn = patch.transaction;
                const nextConditions = { ...(txn.postReturnConditions || {}), ...patch.conditions };
                const nextManualItems = patch.manualItems ?? txn.manualItems;

                const complete =
                    txn.items.every(itemId => nextConditions[itemId] !== undefined) &&
                    areManualItemsComplete(nextManualItems);

                const updates: Partial<Transaction> = {};
                if (Object.keys(patch.conditions).length > 0) updates.postReturnConditions = nextConditions;
                if (patch.manualItems) updates.manualItems = patch.manualItems;
                if (patch.dataReport) updates.dataReport = patch.dataReport;
                if (complete) {
                    updates.status = 'CLOSED';
                    updates.timestampIn = now;
                }

                if (Object.keys(updates).length > 0) {
                    await storage.updateTransaction(transactionId, updates);
                }

                if (user && patch.manualLogDetails) {
                    const count = patch.manualLogCount || 0;
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'RETURN',
                        entityId: transactionId,
                        userId: user.id,
                        timestamp: now,
                        details: `Returned ${count} manual item${count === 1 ? '' : 's'}: ${patch.manualLogDetails}`,
                        departmentId: activeDepartmentId || undefined
                    });
                }

                if (user && complete) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: transactionId,
                        userId: user.id,
                        timestamp: now,
                        details: 'Transaction automatically closed - all items returned and verified',
                        departmentId: activeDepartmentId || undefined
                    });
                }
            }

            // ---- Notify managers only when something actually needs verification ----
            if (pendingCount > 0) {
                try {
                    const allUsers = await storage.getUsers(activeDepartmentId);
                    const managers = allUsers.filter(u =>
                        u.status === 'ACTIVE' &&
                        ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(u.role)
                    );

                    if (managers.length > 0) {
                        const title = 'Items Need Verification';
                        const message = `${user?.name || 'A user'} returned ${selectedCount} item${selectedCount === 1 ? '' : 's'} - ${pendingCount} need${pendingCount === 1 ? 's' : ''} verification.`;

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
            }

            const releasedText = releasedCount > 0
                ? `${releasedCount} item${releasedCount === 1 ? '' : 's'} returned`
                : '';
            const pendingText = pendingCount > 0
                ? `${pendingCount} sent for verification`
                : '';
            showToast(
                [releasedText, pendingText].filter(Boolean).join(', ') || 'Items returned',
                'success'
            );
            setSelectedItems([]);
            setSelectedManualItems([]);
            setConditions({});
            setIssueTypes({});
            setIssueSeverities({});
            setIssueNotes({});
            setZoomAnswers({});
        } catch (error) {
            console.error('Submit return failed:', error);
            showToast('Failed to return items. Please check your connection and try again.', 'error');
        }
    };

    const renderInventoryReturnCard = (item: Equipment) => (
        <Card
            key={item.id}
            className={`cursor-pointer transition-all ${selectedItems.includes(item.id) ? 'ring-2 ring-primary border-transparent' : ''}`}
        >
            <div className="flex items-start justify-between mb-3 sm:mb-4" onClick={() => toggleSelection(item.id)}>
                <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base sm:text-lg truncate">{item.name}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">{item.category} - {item.barcode}</p>
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
    );

    const renderManualReturnCard = ({ item, transaction, key }: ManualReturnRow) => (
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
                        Qty {item.quantity} - {transaction.project || 'Unspecified project'}
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
    );

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Returns</h1>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    {totalReturnableCount > 0 && (
                        <Button
                            onClick={toggleSelectAllReturns}
                            variant="secondary"
                            className="w-full sm:w-auto"
                            size="sm"
                        >
                            {allReturnableSelected ? 'Clear Selection' : `Select All (${totalReturnableCount})`}
                        </Button>
                    )}
                    <Button
                        onClick={handleSubmitReturn}
                        disabled={selectedCount === 0 || !isOnline || missingZoomAnswer}
                        className="w-full sm:w-auto"
                        size="sm"
                    >
                        {!isOnline ? 'Offline' : missingZoomAnswer ? 'Answer Zoom question' : `Return Selected (${selectedCount})`}
                    </Button>
                </div>
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

            {/* Gear vs the data team's items. Their returns behave differently (always held
                for the data team) and ask an extra question, so they get their own tab. */}
            {showDataTab && (
                <div className="flex gap-1.5">
                    {([
                        { id: 'GEAR', label: 'Gear' },
                        { id: 'DATA', label: 'Cards & Data' },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setReturnTab(tab.id)}
                            className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${activeTab === tab.id
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary/60 text-foreground hover:bg-secondary'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* The one thing the app can't work out for itself. Required before submitting. */}
            {cardTransactions.length > 0 && (
                <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/25">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-800 dark:text-cyan-300">
                        Needed for the data team
                    </p>
                    <div className="mt-2 space-y-3">
                        {cardTransactions.map(txn => (
                            <div key={txn.id}>
                                <p className="text-sm font-semibold text-foreground">
                                    Was the Zoom recorder used on {txn.label}?
                                </p>
                                <div className="mt-1.5 flex gap-2">
                                    {([
                                        { value: true, label: 'Yes' },
                                        { value: false, label: 'No' },
                                    ] as const).map(option => (
                                        <button
                                            key={option.label}
                                            type="button"
                                            onClick={() => setZoomAnswers(prev => ({ ...prev, [txn.id]: option.value }))}
                                            className={`h-9 min-w-[72px] rounded-xl px-4 text-sm font-bold transition-colors ${zoomAnswers[txn.id] === option.value
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-background text-muted-foreground hover:text-foreground'
                                                }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    {missingZoomAnswer && (
                        <p className="mt-2 text-[12px] font-medium text-cyan-800 dark:text-cyan-300">
                            Answer this to submit the return.
                        </p>
                    )}
                </div>
            )}

            {checkedOutItems.length === 0 && manualReturnItems.length === 0 ? (
                <div className="text-center py-10 sm:py-12 border-2 border-dashed border-border rounded-lg text-muted-foreground text-sm">
                    You have no items to return.
                </div>
            ) : visibleGroups.length === 0 ? (
                <div className="text-center py-10 sm:py-12 border-2 border-dashed border-border rounded-lg text-muted-foreground text-sm">
                    {activeTab === 'DATA' ? 'No cards or data items to return.' : 'No gear to return.'}
                </div>
            ) : (
                <div className="space-y-3">
                    {visibleGroups.map(group => {
                        const isExpanded = !collapsedGroups.has(group.key);
                        const totalItems = group.items.length + group.manualItems.length;
                        const groupSelected = group.items.every(item => selectedItems.includes(item.id))
                            && group.manualItems.every(row => selectedManualItems.includes(row.key));

                        return (
                            <section key={group.key} className="overflow-hidden rounded-2xl border border-border bg-card">
                                <button
                                    type="button"
                                    onClick={() => toggleGroupExpanded(group.key)}
                                    className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40"
                                    aria-expanded={isExpanded}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <svg
                                                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2.5}
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                                            </svg>
                                            <h2 className="truncate text-base font-bold">{group.title}</h2>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-muted-foreground">
                                            {group.transactionIds.length > 1 && <span>{group.transactionIds.length} transactions</span>}
                                            <span>{group.date}</span>
                                            <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                                            {group.manualItems.length > 0 && (
                                                <span className="text-amber-600 dark:text-amber-300">
                                                    {group.manualItems.length} manual
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                                        {isExpanded ? 'Hide' : 'Open'}
                                    </span>
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-border p-3 sm:p-4">
                                        <div className="mb-3 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => toggleGroupSelection(group)}
                                                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                                            >
                                                {groupSelected ? 'Clear group' : `Select group (${totalItems})`}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                                            {group.items.map(renderInventoryReturnCard)}
                                            {group.manualItems.map(renderManualReturnCard)}
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
