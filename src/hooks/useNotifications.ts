import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { Notification as AppNotification } from '@/types';
import { useAuth } from '@/lib/auth';

export function useNotifications() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const notificationsQuery = useQuery({
        queryKey: ['notifications', user?.id],
        queryFn: async () => {
            if (!user) return [];
            return storage.getNotifications(user.id);
        },
        enabled: !!user,
        staleTime: 10 * 1000, // 10 seconds
        refetchInterval: 30 * 1000, // Poll every 30 seconds
        retry: false, // Don't retry immediately on failure (e.g. offline), wait for next poll or reconnect
    });

    const markReadMutation = useMutation({
        mutationFn: (id: string) => storage.markNotificationRead(id),
        onMutate: async (id) => {
            // Optimistic update
            await queryClient.cancelQueries({ queryKey: ['notifications', user?.id] });
            const previous = queryClient.getQueryData<AppNotification[]>(['notifications', user?.id]);

            if (previous) {
                queryClient.setQueryData<AppNotification[]>(['notifications', user?.id], old =>
                    old?.map(n => n.id === id ? { ...n, read: true } : n) || []
                );
            }
            return { previous };
        },
        onError: (err, id, context) => {
            if (context?.previous) {
                queryClient.setQueryData(['notifications', user?.id], context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
        }
    });

    return {
        notifications: notificationsQuery.data || [],
        unreadCount: (notificationsQuery.data || []).filter(n => !n.read).length,
        isLoading: notificationsQuery.isLoading,
        markAsRead: markReadMutation.mutateAsync
    };
}
