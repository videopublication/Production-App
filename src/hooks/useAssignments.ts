import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Assignment } from '@/types';

export function useAssignments() {
    const queryClient = useQueryClient();

    const assignmentsQuery = useQuery({
        queryKey: ['assignments'],
        queryFn: () => storage.getAssignments(),
        staleTime: 5 * 60 * 1000,
    });

    return {
        assignments: assignmentsQuery.data || [],
        isLoading: assignmentsQuery.isLoading,
        isError: assignmentsQuery.isError,
        refresh: () => assignmentsQuery.refetch()
    };
}
