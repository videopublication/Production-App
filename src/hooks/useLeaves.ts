import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Leave } from '@/types';
import { useAuth } from '@/lib/auth';
import { useDepartment } from '@/lib/department-context';
import { supabase } from '@/lib/supabase';

export function useLeaves() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { department } = useDepartment();
    const activeDepartmentId = user?.role === 'SUPER_ADMIN' ? (department?.id || null) : user?.departmentId;

    useEffect(() => {
        if (!user) return;

        const channel = supabase.channel('public:leaves')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'leaves' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['leaves', activeDepartmentId] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, activeDepartmentId, queryClient]);

    const leavesQuery = useQuery({
        queryKey: ['leaves', activeDepartmentId],
        queryFn: () => storage.getLeaves(activeDepartmentId),
        enabled: !!user,
        staleTime: 0, // Force fresh data always on mount
        refetchInterval: 7000, // Poll every 7 seconds as a reliable fallback for Realtime
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
        isRefetching: leavesQuery.isRefetching,
        error: leavesQuery.error,
        refetch: leavesQuery.refetch,
        addLeave: addLeaveMutation.mutateAsync,
        updateLeave: updateLeaveMutation.mutateAsync,
        deleteLeave: deleteLeaveMutation.mutateAsync
    };
}
