import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Shoot } from '@/types';

export function useShoots() {
    const queryClient = useQueryClient();

    const shootsQuery = useQuery({
        queryKey: ['shoots'],
        queryFn: () => storage.getShoots(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    const updateShootMutation = useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Shoot> }) =>
            storage.updateShoot(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shoots'] });
        },
    });

    return {
        shoots: shootsQuery.data || [],
        isLoading: shootsQuery.isLoading,
        isError: shootsQuery.isError,
        error: shootsQuery.error,
        updateShoot: updateShootMutation.mutateAsync,
        isUpdating: updateShootMutation.isPending,
        refresh: () => shootsQuery.refetch()
    };
}
