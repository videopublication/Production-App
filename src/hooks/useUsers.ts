import { useQuery } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { useDepartment } from '@/lib/department-context';
import { useAuth } from '@/lib/auth';

export const USER_KEYS = {
    all: ['users'] as const,
    byDept: (deptId: string | null) => [...USER_KEYS.all, 'dept', deptId] as const,
    detail: (id: string) => [...USER_KEYS.all, id] as const,
};

export function useUsers() {
    const { user } = useAuth();
    const { department } = useDepartment();

    // Regular users: ALWAYS use their own department
    // Super Admins: use selected department from context (null = all)
    const departmentId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);

    return useQuery({
        queryKey: USER_KEYS.byDept(departmentId),
        queryFn: () => storage.getUsers(departmentId),
        enabled: !!user,
        staleTime: 60 * 1000, // 1 minute
    });
}
