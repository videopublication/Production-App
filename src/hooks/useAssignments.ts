import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Assignment } from '@/types';
import { useDepartment } from '@/lib/department-context';
import { useAuth } from '@/lib/auth';

export const ASSIGNMENT_KEYS = {
    all: ['assignments'] as const,
    byDept: (deptId: string | null) => [...ASSIGNMENT_KEYS.all, 'dept', deptId || 'all'] as const,
    byShoot: (shootId: string) => [...ASSIGNMENT_KEYS.all, 'shoot', shootId] as const,
};

export function useAssignments() {
    const { user } = useAuth();
    const { department } = useDepartment();

    const departmentId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);

    return useQuery({
        queryKey: ASSIGNMENT_KEYS.byDept(departmentId),
        queryFn: () => storage.getAssignments(departmentId),
        enabled: !!user,
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
