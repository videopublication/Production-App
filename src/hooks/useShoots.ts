import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Shoot } from '@/types';

// Keys for query caching
export const SHOOT_KEYS = {
    all: ['shoots'] as const,
    detail: (id: string) => [...SHOOT_KEYS.all, id] as const,
};

// Hook to fetch all shoots
export function useShoots() {
    return useQuery({
        queryKey: SHOOT_KEYS.all,
        queryFn: () => storage.getShoots(),
        staleTime: 5 * 60 * 1000, // Data is fresh for 5 minutes
    });
}

// Hook to fetch a single shoot
export function useShoot(id: string) {
    return useQuery({
        queryKey: SHOOT_KEYS.detail(id),
        queryFn: async () => {
            const shoots = await storage.getShoots();
            return shoots.find(s => s.id === id);
        },
        enabled: !!id, // Only run if ID is provided
    });
}

// Hook to create/update a shoot
export function useSaveShoot() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (shoot: Shoot) => storage.saveShoot(shoot),
        onSuccess: (_, variables) => {
            // Invalidate list
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.all });
            // Invalidate detail if it was an update
            if (variables.id) {
                queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.detail(variables.id) });
            }
        },
    });
}

// Hook to specific update (partial)
export function useUpdateShoot() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Shoot> }) =>
            storage.updateShoot(id, updates),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.all });
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.detail(id) });
        },
    });
}

// Hook to delete a shoot
export function useDeleteShoot() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => storage.deleteShoot(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.all });
        },
    });
}
