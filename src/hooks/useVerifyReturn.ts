import { useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Condition, Equipment, EquipmentIssueSeverity, EquipmentIssueType, Transaction } from '@/types';
import { issueToCondition, withActiveIssue } from '@/lib/equipment-issues';
import { releasedEquipmentUpdates } from '@/lib/return-verification';
import { areManualItemsComplete } from '@/lib/transaction-manual-items';
import { sendPushNotification } from '@/lib/push-notifications';

/**
 * Verification done by the NEXT person to check an item out, instead of by a manager.
 *
 * A returned item sits in PENDING_VERIFICATION, which used to make it un-checkoutable
 * until a manager cleared it. Whoever picks it up next is the person with the strongest
 * reason to inspect it, so they confirm it here: the returner asserts the condition, a
 * different person confirms it, and no manager is needed for the normal case.
 *
 * `outcome: 'OK'`    → item goes back into circulation and the original transaction is
 *                      settled/closed, exactly as a manager verify would.
 * `outcome: 'ISSUE'` → the inspector's report is recorded and the item STAYS pending for
 *                      a manager. It is not handed over.
 */
export function useVerifyReturnedItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            item,
            outcome,
            actor,
            departmentId,
            issue,
        }: {
            item: Equipment;
            outcome: 'OK' | 'ISSUE';
            actor: { id?: string; name?: string };
            departmentId?: string | null;
            issue?: {
                issueType: EquipmentIssueType;
                issueSeverity: EquipmentIssueSeverity;
                note: string;
            };
        }) => {
            const now = new Date().toISOString();

            if (outcome === 'ISSUE') {
                if (!issue) throw new Error('An issue report is required to reject an item');
                const issueCondition: Condition = issueToCondition(issue.issueType, issue.issueSeverity);

                // Stays in the manager queue — this is the exception path, so it is not
                // released and not handed to the person checking out.
                await storage.updateEquipment(item.id, {
                    status: 'PENDING_VERIFICATION',
                    condition: issueCondition,
                    metadata: withActiveIssue(item.metadata, {
                        condition: issueCondition,
                        issueType: issue.issueType,
                        severity: issue.issueSeverity,
                        note: issue.note,
                        source: 'crew_report',
                        reportedAt: now,
                        reportedBy: actor.id,
                        reporterName: actor.name,
                    }),
                });

                await storage.addLog({
                    id: crypto.randomUUID(),
                    action: 'VERIFY',
                    entityId: item.id,
                    userId: actor.id,
                    timestamp: now,
                    details: `Checkout inspection of "${item.name}" (${item.barcode}) reported an issue: ${issue.note}. Held for manager verification.`,
                    newValue: { checkoutInspection: true, outcome: 'ISSUE' },
                    departmentId: item.departmentId || departmentId || undefined,
                });

                // An exception genuinely needs manager attention, so this one does notify.
                try {
                    const users = await storage.getUsers(departmentId);
                    const managers = users.filter(u =>
                        u.status === 'ACTIVE' &&
                        ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(u.role) &&
                        u.id !== actor.id
                    );
                    if (managers.length > 0) {
                        const title = 'Issue Reported At Checkout';
                        const message = `${actor.name || 'A user'} found an issue with "${item.name}" while checking out: ${issue.note}`;
                        await Promise.all([
                            sendPushNotification({
                                userIds: managers.map(m => m.id),
                                title,
                                message,
                                link: '/verification',
                            }).catch(e => console.error('Checkout issue push failed', e)),
                            ...managers.map(m => storage.addNotification({
                                userId: m.id,
                                title,
                                message,
                                link: '/verification',
                                departmentId: departmentId ?? undefined,
                            })),
                        ]);
                    }
                } catch (e) {
                    console.error('Failed to notify managers about checkout issue', e);
                }

                return { released: false };
            }

            // ---- Verified OK: release it, and settle the transaction it came back from ----
            await storage.updateEquipment(item.id, releasedEquipmentUpdates(item, now));

            // Recording the condition on the still-open transaction is what allows it to
            // close — it is the key every closing path checks.
            const allTransactions = await storage.getTransactions(
                undefined, undefined, undefined, undefined, undefined, undefined, departmentId
            );
            const txn = allTransactions.slice().reverse().find(t =>
                t.status === 'OPEN' && t.items.includes(item.id)
            );

            if (txn) {
                const nextConditions: Record<string, Condition> = {
                    ...(txn.postReturnConditions || {}),
                    [item.id]: 'OK',
                };
                const complete =
                    txn.items.every(id => nextConditions[id] !== undefined) &&
                    areManualItemsComplete(txn.manualItems);

                const updates: Partial<Transaction> = { postReturnConditions: nextConditions };
                if (complete) {
                    updates.status = 'CLOSED';
                    updates.timestampIn = now;
                }
                await storage.updateTransaction(txn.id, updates);

                if (complete) {
                    await storage.addLog({
                        id: crypto.randomUUID(),
                        action: 'EDIT',
                        entityId: txn.id,
                        userId: actor.id,
                        timestamp: now,
                        details: 'Transaction automatically closed - all items returned and verified',
                        departmentId: item.departmentId || departmentId || undefined,
                    });
                }
            }

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'VERIFY',
                entityId: item.id,
                userId: actor.id,
                timestamp: now,
                details: `Verified "${item.name}" (${item.barcode}) at checkout - condition confirmed by the next user, no manager verification needed`,
                newValue: { checkoutInspection: true, outcome: 'OK' },
                departmentId: item.departmentId || departmentId || undefined,
            });

            return { released: true };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
        },
    });
}
