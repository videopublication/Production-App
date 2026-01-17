import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Equipment, User } from '@/types';

export function useInventory() {
    const queryClient = useQueryClient();

    const equipmentQuery = useQuery({
        queryKey: ['equipment'],
        queryFn: () => storage.getEquipment(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    const usersQuery = useQuery({
        queryKey: ['users'],
        queryFn: () => storage.getUsers(),
        staleTime: 10 * 60 * 1000, // 10 minutes (users change less often)
    });

    const updateEquipmentMutation = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Equipment> }) =>
            storage.updateEquipment(id, updates),
        onSuccess: () => {
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
        onSuccess: () => {
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
