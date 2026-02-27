import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Shoot } from '@/types';

// Keys for query caching
export const SHOOT_KEYS = {
    all: ['shoots'] as const,
    byDepartment: (deptId: string | null) => [...SHOOT_KEYS.all, 'department', deptId || 'all'] as const,
    detail: (id: string) => [...SHOOT_KEYS.all, id] as const,
};

import { useDepartment } from '@/lib/department-context';
import { useAuth } from '@/lib/auth';

// Hook to fetch all shoots
export function useShoots() {
    const { user } = useAuth();
    const { department } = useDepartment();

    // Regular users: ALWAYS use their own department
    // Super Admins: use selected department from context (null = all)
    const departmentId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);

    return useQuery({
        queryKey: SHOOT_KEYS.byDepartment(departmentId),
        queryFn: () => storage.getShoots(departmentId),
        enabled: !!user,
    });
}

// Hook to fetch a single shoot
export function useShoot(id: string) {
    const { user } = useAuth();
    const { department } = useDepartment();

    const departmentId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);

    return useQuery({
        queryKey: SHOOT_KEYS.detail(id),
        queryFn: async () => {
            const shoots = await storage.getShoots(departmentId);
            return shoots.find(s => s.id === id || s.shootNumber?.toString() === id);
        },
        enabled: !!id && !!user, // Only run if ID is provided
    });
}

// Hook to create/update a shoot
export function useSaveShoot() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (shoot: Shoot) => storage.saveShoot(shoot),
        onSuccess: (_, variables) => {
            // Manually update cache for immediate feedback
            queryClient.setQueryData(SHOOT_KEYS.all, (old: Shoot[] | undefined) => {
                if (!old) return [variables];
                // Check if it's an update
                const existingIndex = old.findIndex(s => s.id === variables.id);
                if (existingIndex >= 0) {
                    return old.map(s => s.id === variables.id ? variables : s);
                }
                // It's a new shoot
                return [...old, variables];
            });

            if (variables.id) {
                queryClient.setQueryData(SHOOT_KEYS.detail(variables.id), variables);
            }

            // Invalidate to ensure sync with server eventually
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.all });
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
        onMutate: async ({ id, updates }) => {
            await queryClient.cancelQueries({ queryKey: SHOOT_KEYS.all });
            await queryClient.cancelQueries({ queryKey: SHOOT_KEYS.detail(id) });

            const previousShoots = queryClient.getQueryData<Shoot[]>(SHOOT_KEYS.all);
            const previousShoot = queryClient.getQueryData<Shoot>(SHOOT_KEYS.detail(id));

            // Update List
            queryClient.setQueryData(SHOOT_KEYS.all, (old: Shoot[] | undefined) => {
                if (!old) return old;
                return old.map(s => s.id === id ? { ...s, ...updates } : s);
            });

            // Update Detail
            queryClient.setQueryData(SHOOT_KEYS.detail(id), (old: Shoot | undefined) => {
                if (!old) return old;
                return { ...old, ...updates };
            });

            return { previousShoots, previousShoot };
        },
        onError: (_err, _newTodo, context) => {
            if (context?.previousShoots) {
                queryClient.setQueryData(SHOOT_KEYS.all, context.previousShoots);
            }
            if (context?.previousShoot) {
                queryClient.setQueryData(SHOOT_KEYS.detail(_newTodo.id), context.previousShoot);
            }
        },
        onSettled: (_, __, { id }) => {
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
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: SHOOT_KEYS.all });
            const previousShoots = queryClient.getQueryData<Shoot[]>(SHOOT_KEYS.all);

            queryClient.setQueryData(SHOOT_KEYS.all, (old: Shoot[] | undefined) => {
                if (!old) return old;
                return old.filter(s => s.id !== id);
            });

            return { previousShoots };
        },
        onError: (_err, id, context) => {
            if (context?.previousShoots) {
                queryClient.setQueryData(SHOOT_KEYS.all, context.previousShoots);
            }
        },
        onSettled: (_, __, id) => {
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.all });
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.detail(id) });
        },
    });
}
