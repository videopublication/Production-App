import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { ShootReview, ShootReviewStatus } from '@/types';
import { useDepartment } from '@/lib/department-context';
import { useAuth } from '@/lib/auth';
import { SHOOT_KEYS } from '@/hooks/useShoots';

export const SHOOT_REVIEW_KEYS = {
    all: ['shoot_reviews'] as const,
    byDepartment: (deptId: string | null) => [...SHOOT_REVIEW_KEYS.all, 'dept', deptId || 'all'] as const,
    byShoot: (shootId: string) => [...SHOOT_REVIEW_KEYS.all, 'shoot', shootId] as const,
};

export function useShootReviews(shootId: string) {
    const { user } = useAuth();

    return useQuery({
        queryKey: SHOOT_REVIEW_KEYS.byShoot(shootId),
        queryFn: () => storage.getShootReviews(shootId),
        enabled: !!shootId && !!user,
    });
}

export function useAllShootReviews() {
    const { user } = useAuth();
    const { department } = useDepartment();

    const departmentId = (user && user.role !== 'SUPER_ADMIN' && user.departmentId)
        ? user.departmentId
        : (department?.id || null);

    return useQuery({
        queryKey: SHOOT_REVIEW_KEYS.byDepartment(departmentId),
        queryFn: () => storage.getAllShootReviews(departmentId),
        enabled: !!user,
    });
}

export function useAddShootReview() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (review: Omit<ShootReview, 'id' | 'createdAt'>) => storage.addShootReview(review),
        onSuccess: (newReview) => {
            queryClient.invalidateQueries({ queryKey: SHOOT_REVIEW_KEYS.byShoot(newReview.shootId) });
            queryClient.invalidateQueries({ queryKey: SHOOT_REVIEW_KEYS.all });
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.all });
        },
    });
}

export function useDeleteShootReview() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, shootId }: { id: string; shootId: string }) => storage.deleteShootReview(id),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: SHOOT_REVIEW_KEYS.byShoot(variables.shootId) });
            queryClient.invalidateQueries({ queryKey: SHOOT_REVIEW_KEYS.all });
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.all });
        },
    });
}

export function useUpdateShootReviewStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            shootId,
            status,
            completedBy,
            videoUrl
        }: {
            shootId: string;
            status: ShootReviewStatus;
            completedBy?: string;
            videoUrl?: string;
        }) => storage.updateShootReviewStatus(shootId, status, completedBy, videoUrl),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.all });
            queryClient.invalidateQueries({ queryKey: SHOOT_REVIEW_KEYS.byShoot(variables.shootId) });
            queryClient.invalidateQueries({ queryKey: SHOOT_REVIEW_KEYS.all });
        },
    });
}

export function useUpdateShootVideoUrl() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ shootId, videoUrl }: { shootId: string; videoUrl: string }) =>
            storage.updateShootVideoUrl(shootId, videoUrl),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: SHOOT_KEYS.all });
            queryClient.invalidateQueries({ queryKey: SHOOT_REVIEW_KEYS.byShoot(variables.shootId) });
        },
    });
}
