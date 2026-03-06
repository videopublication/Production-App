import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Leave } from '@/types';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';

export function useLeaves() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { department } = useDepartment();
    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;

    const leavesQuery = useQuery({
        queryKey: ['leaves', activeDepartmentId],
        queryFn: () => storage.getLeaves(activeDepartmentId),
        enabled: !!user
    });

    const addLeaveMutation = useMutation({
        mutationFn: (leave: Partial<Leave>) => storage.addLeave(leave),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leaves', activeDepartmentId] });
        }
    });

    const updateLeaveMutation = useMutation({
        mutationFn: ({ id, updates }: { id: string, updates: Partial<Leave> }) => storage.updateLeave(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leaves', activeDepartmentId] });
        }
    });

    const deleteLeaveMutation = useMutation({
        mutationFn: (id: string) => storage.deleteLeave(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leaves', activeDepartmentId] });
        }
    });

    return {
        leaves: leavesQuery.data || [],
        isLoading: leavesQuery.isLoading,
        error: leavesQuery.error,
        addLeave: addLeaveMutation.mutateAsync,
        updateLeave: updateLeaveMutation.mutateAsync,
        deleteLeave: deleteLeaveMutation.mutateAsync
    };
}
