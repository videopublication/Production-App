import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Equipment, Transaction } from '@/types';
import { generateTransactionId } from '@/lib/id';

export const TRANSACTION_KEYS = {
    all: ['transactions'] as const,
    byUser: (userId: string) => [...TRANSACTION_KEYS.all, 'user', userId] as const,
};

export function useTransactions() {
    return useQuery({
        queryKey: TRANSACTION_KEYS.all,
        queryFn: () => storage.getTransactions(),
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
            notes,
            location,
            project
        }: {
            items: Equipment[],
            shootId?: string,
            userId: string,
            notes?: string,
            location?: string,
            project: string
        }) => {

            const transactionId = generateTransactionId();

            // 1. Create the Transaction Record
            const transaction: Transaction = {
                id: transactionId,
                userId,
                items: items.map(i => i.id),
                timestampOut: new Date().toISOString(),
                project,
                shootId,
                notes,
                preCheckoutConditions: items.reduce((acc, item) => ({ ...acc, [item.id]: item.condition }), {} as Record<string, any>),
                status: 'OPEN'
            };

            await storage.saveTransaction(transaction);

            // 2. Update Equipment Status
            await Promise.all(items.map(item =>
                storage.updateEquipment(item.id, {
                    status: 'CHECKED_OUT',
                    assignedTo: userId,
                    location: location || item.location,
                })
            ));

            // 3. Log it
            await storage.addLog({
                id: crypto.randomUUID(),
                action: 'CHECKOUT',
                entityId: transactionId,
                userId,
                timestamp: new Date().toISOString(),
                details: `Checked out ${items.length} items for ${project}`
            });

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

            const allTransactions = await storage.getTransactions();
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
                    assignedTo: null as any, // Unassign
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
                    details: `Returned item ${item.name} ` + (notes ? `(Notes: ${notes})` : '')
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
        },
    });
}
