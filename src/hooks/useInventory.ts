import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Equipment, User } from '@/types';

export function useInventory() {
    const queryClient = useQueryClient();

    const equipmentQuery = useQuery({
        queryKey: ['equipment'],
        queryFn: () => storage.getEquipment(),
        // global staleTime (5 min) applies
    });

    const usersQuery = useQuery({
        queryKey: ['users'],
        queryFn: () => storage.getUsers(),
        staleTime: 60 * 60 * 1000, // 1 hour for users is probably fine
    });

    const updateEquipmentMutation = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Equipment> }) =>
            storage.updateEquipment(id, updates),
        onMutate: async ({ id, updates }) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: ['equipment'] });

            // Snapshot the previous value
            const previousEquipment = queryClient.getQueryData<Equipment[]>(['equipment']);

            // Optimistically update to the new value
            queryClient.setQueryData(['equipment'], (old: Equipment[] | undefined) => {
                if (!old) return [];
                return old.map(item => item.id === id ? { ...item, ...updates } : item);
            });

            // Return a context object with the snapshotted value
            return { previousEquipment };
        },
        onError: (_err, _newTodo, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousEquipment) {
                queryClient.setQueryData(['equipment'], context.previousEquipment);
            }
        },
        onSettled: () => {
            // Always refetch after error or success:
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
        },
    });

    const cleanupAssignmentsMutation = useMutation({
        mutationFn: async (itemsToCleanup: Equipment[]) => {
            await Promise.all(
                itemsToCleanup.map((item) =>
                    storage.updateEquipment(item.id, { assignedTo: null as any })
                )
            );
        },
        onMutate: async (itemsToCleanup) => {
            await queryClient.cancelQueries({ queryKey: ['equipment'] });
            const previousEquipment = queryClient.getQueryData<Equipment[]>(['equipment']);

            queryClient.setQueryData(['equipment'], (old: Equipment[] | undefined) => {
                if (!old) return [];
                const idsToClean = new Set(itemsToCleanup.map(i => i.id));
                return old.map(item => idsToClean.has(item.id) ? { ...item, assignedTo: null as any } : item);
            });

            return { previousEquipment };
        },
        onError: (_err, _newTodo, context) => {
            if (context?.previousEquipment) {
                queryClient.setQueryData(['equipment'], context.previousEquipment);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
        },
    });

    return {
        equipment: equipmentQuery.data || [],
        users: usersQuery.data || [],
        isLoading: equipmentQuery.isLoading || usersQuery.isLoading,
        isError: equipmentQuery.isError || usersQuery.isError,
        error: equipmentQuery.error || usersQuery.error,
        updateEquipment: updateEquipmentMutation.mutateAsync,
        cleanupAssignments: cleanupAssignmentsMutation.mutateAsync,
        isUpdating: updateEquipmentMutation.isPending || cleanupAssignmentsMutation.isPending,
        refresh: async () => {
            await Promise.all([equipmentQuery.refetch(), usersQuery.refetch()]);
        }
    };
}
