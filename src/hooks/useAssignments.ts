import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Assignment } from '@/types';

export const ASSIGNMENT_KEYS = {
    all: ['assignments'] as const,
    byShoot: (shootId: string) => [...ASSIGNMENT_KEYS.all, 'shoot', shootId] as const,
};

export function useAssignments() {
    return useQuery({
        queryKey: ASSIGNMENT_KEYS.all,
        queryFn: () => storage.getAssignments(),
        staleTime: 5 * 60 * 1000,
    });
}

export function useSaveAssignments() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (assignments: Assignment[]) => storage.saveAssignments(assignments),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ASSIGNMENT_KEYS.all });
        },
    });
}
