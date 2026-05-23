import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Equipment, Transaction } from '@/types';
import { generateTransactionId } from '@/lib/id';
import { sendPushNotification } from '@/lib/push-notifications';

export const TRANSACTION_KEYS = {
    all: ['transactions'] as const,
    byUser: (userId: string) => [...TRANSACTION_KEYS.all, 'user', userId] as const,
    byDepartment: (deptId: string | null) => [...TRANSACTION_KEYS.all, 'department', deptId || 'all'] as const,
};

import { useDepartment } from '@/lib/department-context';
import { useAuth } from '@/lib/auth';

export function useTransactions() {
    const { user } = useAuth();
    const { department } = useDepartment();

    // Regular users: ALWAYS use their own department
    // Super Admins: use selected department from context (null = all)
    const departmentId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);

    return useQuery({
        queryKey: TRANSACTION_KEYS.byDepartment(departmentId),
        queryFn: () => storage.getTransactions(undefined, undefined, undefined, undefined, undefined, undefined, departmentId),
        enabled: !!user,
        staleTime: 0,
    });
}

// Hook to check out items
export function useCheckOut() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            items,
            shootId,
            userId,
            additionalUsers = [],
            notes,
            location,
            project,
            id,
            departmentId,
            performerId,
            targetUserName
        }: {
            items: Equipment[],
            shootId?: string,
            userId: string,
            additionalUsers?: string[],
            notes?: string,
            location?: string,
            project: string,
            id?: string,
            displayId?: string,
            departmentId?: string,
            performerId?: string,
            targetUserName?: string
        }) => {

            const transactionId = id || generateTransactionId();

            // 1. Create the Transaction Record
            // HYBRID MIGRATION: 
            // - id: Still the TXN-XXXX (Legacy PK, to be swapped later)
            // - display_id: TXN-XXXX (The permanent readable ID)
            // - system_id: UUID (The future PK)

            const systemUUID = crypto.randomUUID(); // Valid V4 UUID

            const transaction: Transaction = {
                id: transactionId,
                userId,
                additionalUsers,
                items: items.map(i => i.id),
                timestampOut: new Date().toISOString(),
                project,
                shootId,
                notes,
                preCheckoutConditions: items.reduce((acc, item) => ({ ...acc, [item.id]: item.condition }), {} as Record<string, Equipment['condition']>),
                status: 'OPEN',
                departmentId
            };

            // Enhanced Save with new columns
            await storage.saveTransaction(transaction, systemUUID, transactionId);

            // 2. Update Equipment Status
            // We still assign to the primary userId for simple tracking, or we could change this logic.
            // For now, let's keep assignedTo as the primary user, but the Transaction holds the full team.
            await Promise.all(items.map(item =>
                storage.updateEquipment(item.id, {
                    status: 'CHECKED_OUT',
                    assignedTo: userId,
                    location: location || item.location,
                })
            ));

            // 3. Log it
            const isBehalf = performerId && performerId !== userId;
            const logUserId = isBehalf ? performerId : userId;
            const detailsMsg = isBehalf && targetUserName
                ? `Checked out ${items.length} items for ${project} on behalf of ${targetUserName}`
                : `Checked out ${items.length} items for ${project}`;

            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'CHECKOUT',
                entityId: transactionId,
                userId: logUserId,
                timestamp: new Date().toISOString(),
                details: detailsMsg,
                departmentId
            });

            // 4. Notify the user
            if (userId !== performerId) {
                const title = 'Equipment Checked Out';
                const message = `Admin has checked out ${items.length} items to you for ${project}.`;
                
                await storage.addNotification({
                    userId,
                    title,
                    message,
                    link: '/transactions',
                    departmentId
                });

                // Fetch user to get FCM token
                const users = await storage.getUsers(departmentId);
                const assignedUser = users.find(u => u.id === userId);
                if (assignedUser?.fcmToken) {
                    sendPushNotification({
                        token: assignedUser.fcmToken,
                        title,
                        message,
                        link: '/transactions'
                    }).catch(e => console.error('Push notification failed', e));
                }
            }

            return transaction;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['shoots'] });
        },
    });
}

// Hook to check in items
export function useCheckIn() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { department } = useDepartment();
    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;

    return useMutation({
        mutationFn: async ({
            items,
            userId,
            notes,
            location,
            condition
        }: {
            items: Equipment[],
            userId: string,
            notes?: string,
            location?: string,
            condition?: Equipment['condition']
        }) => {

            const allTransactions = await storage.getTransactions(undefined, undefined, undefined, undefined, undefined, undefined, activeDepartmentId);
            const timestamp = new Date().toISOString();

            for (const item of items) {
                // Find open transaction containing this item
                // Use reverse() to find most recent if multiple exist (though shouldn't happen ideally)
                const txn = allTransactions.slice().reverse().find(t =>
                    t.status === 'OPEN' &&
                    t.items.includes(item.id)
                );

                if (txn) {
                    const currentConditions = txn.postReturnConditions || {};
                    const updatedConditions = { ...currentConditions, [item.id]: condition || item.condition };

                    // Check if all items in this transaction are now accounted for in postReturnConditions
                    const allReturned = txn.items.every(id =>
                        updatedConditions[id] !== undefined
                    );

                    const updates: Partial<Transaction> = {
                        postReturnConditions: updatedConditions
                    };

                    if (allReturned) {
                        updates.status = 'CLOSED';
                        updates.timestampIn = timestamp;
                    }

                    await storage.updateTransaction(txn.id, updates);

                    // Update local txn object to reflect changes for subsequent items in the loop
                    txn.postReturnConditions = updatedConditions;
                    if (allReturned) txn.status = 'CLOSED';
                }

                // Update Equipment Status
                await storage.updateEquipment(item.id, {
                    status: 'AVAILABLE',
                    assignedTo: null as unknown as string, // Unassign
                    location: location || item.location,
                    condition: condition || item.condition,
                });

                // Add Check-In Log
                await storage.addLog({
                    id: crypto.randomUUID(), // New ID
                    action: 'RETURN', // Using 'RETURN' as valid ActionType
                    entityId: item.id,
                    userId,
                    timestamp,
                    details: `Returned item ${item.name} ` + (notes ? `(Notes: ${notes})` : ''),
                    departmentId: item.departmentId
                });
            }

            // Notify User
            if (userId && items.length > 0) {
                const title = 'Equipment Verified & Checked In';
                const message = `Admin has successfully checked in ${items.length} items returned by you.`;
                
                await storage.addNotification({
                    userId,
                    title,
                    message,
                    link: '/transactions',
                    departmentId: activeDepartmentId || undefined
                });

                const users = await storage.getUsers(activeDepartmentId);
                const userObj = users.find(u => u.id === userId);
                if (userObj?.fcmToken) {
                    sendPushNotification({
                        token: userObj.fcmToken,
                        title,
                        message,
                        link: '/transactions'
                    }).catch(e => console.error('Push notification failed', e));
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
        },
    });
}
